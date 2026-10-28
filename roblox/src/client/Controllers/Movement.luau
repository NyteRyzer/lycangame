--!strict
-- Traversal, the heart of LYCAN: momentum sprinting, running leaps, mid-air
-- jumps, wall climbing with ledge mantles and wall jumps, wall-running, dashes,
-- the aerial ground-slam dive, and the Flow meter that rewards chaining them.
--
-- Roblox characters are simulated by their owning client, so this runs
-- locally for responsiveness. The server caps base stats per form and
-- decides everything that matters (damage, rewards, i-frames).

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local Types = require(Shared.Types)
local Net = require(Shared.Net)
local Progression = require(Shared.Progression)
local ClientState = require(script.Parent.Parent.Lib.ClientState)

local player = Players.LocalPlayer

local Movement = {}

local character: Model? = nil
local humanoid: Humanoid? = nil
local root: BasePart? = nil

local sprintHeld = false
local sprintToggle = false
local airJumpsLeft = 0
local lastAirJump = 0
local leftGroundAt = 0
local climbCooldownUntil = 0
local wallRunT = 0
local wallRunCooldownUntil = 0
local wallNormal = Vector3.zero
local dashReadyAt = 0
local fallStartY = 0
local wasAirborne = false

local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude
rayParams.RespectCanCollide = true -- ignore leaves, windows, moonstones and effects

local function form(): string
	local f = player:GetAttribute("Form")
	return if typeof(f) == "string" then f else "human"
end

local function stats(): Types.FormStats
	return Config.FORMS[form() :: any] or Config.FORMS.human
end

local function skill(id: string): number
	local v = player:GetAttribute("Skill_" .. id)
	return if typeof(v) == "number" then v else 0
end

local function frenzy(): boolean
	local untilT = player:GetAttribute("FrenzyUntil")
	return typeof(untilT) == "number" and workspace:GetServerTimeNow() < untilT
end

local function airborne(h: Humanoid): boolean
	return h.FloorMaterial == Enum.Material.Air
end

local function cast(origin: Vector3, dir: Vector3): RaycastResult?
	local c = character
	rayParams.FilterDescendantsInstances = if c then { c, workspace:FindFirstChild("NPCs") :: Instance } else {}
	return workspace:Raycast(origin, dir, rayParams)
end

local function moveDir(): Vector3
	local h = humanoid
	if not h then
		return Vector3.zero
	end
	return h.MoveDirection
end

local function flatLook(): Vector3
	local cam = workspace.CurrentCamera
	local look = cam.CFrame.LookVector
	local flat = Vector3.new(look.X, 0, look.Z)
	return if flat.Magnitude > 0.01 then flat.Unit else Vector3.new(0, 0, -1)
end

---------------------------------------------------------------- actions

local function dash()
	local h, r = humanoid, root
	if not h or not r or os.clock() < dashReadyAt or player:GetAttribute("Transforming") then
		return
	end
	dashReadyAt = os.clock() + Config.DASH_COOLDOWN
	local dir = moveDir()
	if dir.Magnitude < 0.1 then
		dir = flatLook()
	end
	local f = form()
	local power = if f == "wolf" then 120 elseif f == "hybrid" then 105 else 80
	local v = r.AssemblyLinearVelocity
	r.AssemblyLinearVelocity = Vector3.new(dir.X * power, math.max(v.Y, if airborne(h) then 12 else 6), dir.Z * power)
	Net.event("Action"):FireServer("dash")
	ClientState.kick(8)
	ClientState.addFlow(0.08)
end

local function airJump()
	local h, r = humanoid, root
	if not h or not r then
		return
	end
	local t = os.clock()
	if airJumpsLeft <= 0 or t - lastAirJump < 0.25 or t - leftGroundAt < 0.18 then
		return
	end
	airJumpsLeft -= 1
	lastAirJump = t
	local v = r.AssemblyLinearVelocity
	local up = h.JumpPower * 0.95
	local dir = moveDir()
	local carry = Vector3.new(v.X, 0, v.Z)
	if dir.Magnitude > 0.1 then
		carry = dir * math.max(carry.Magnitude, stats().walk * 1.2)
	end
	r.AssemblyLinearVelocity = carry + Vector3.new(0, up, 0)
	ClientState.addFlow(0.12)
	ClientState.kick(5)
end

-- Kick off the wall you are climbing or running along.
local function wallJump()
	local r = root
	if not r then
		return
	end
	local away = wallNormal
	local dir = moveDir()
	local push = away * 55 + Vector3.new(0, 62, 0) + (if dir.Magnitude > 0.1 then dir * 25 else Vector3.zero)
	r.AssemblyLinearVelocity = push
	ClientState.climbing = false
	ClientState.wallRunSide = 0
	climbCooldownUntil = os.clock() + 0.35
	wallRunCooldownUntil = os.clock() + 0.25
	ClientState.addFlow(0.18)
	ClientState.kick(6)
end

function Movement.startDive()
	local h, r = humanoid, root
	if not h or not r or not airborne(h) or form() == "human" or ClientState.diving then
		return false
	end
	ClientState.diving = true
	local v = r.AssemblyLinearVelocity
	r.AssemblyLinearVelocity = Vector3.new(v.X * 0.4, -170, v.Z * 0.4)
	return true
end

---------------------------------------------------------------- per-frame

local function updateSpeed(dt: number, h: Humanoid)
	local s = stats()
	local f = form()
	local sprinting = (sprintHeld or sprintToggle) and h.MoveDirection.Magnitude > 0.1
	if h.MoveDirection.Magnitude < 0.1 then
		sprintToggle = false
	end
	ClientState.sprinting = sprinting
	local mul = Progression.speedMul(f, skill("swift"))
	if frenzy() then
		mul *= 1.15
	end
	mul *= 1 + ClientState.flow * 0.25
	local target = (if sprinting then s.sprint else s.walk) * mul
	if player:GetAttribute("Transforming") then
		target *= 0.35
	end
	if player:GetAttribute("Blocking") then
		target *= 0.45
	end
	if os.clock() < ClientState.attackLockUntil then
		target *= 0.5
	end
	-- momentum: beasts take a moment to reach full gallop, slow down fast
	local rate = if target > h.WalkSpeed then (if f == "wolf" then 55 elseif f == "hybrid" then 70 else 90) else 160
	h.WalkSpeed = h.WalkSpeed + math.clamp(target - h.WalkSpeed, -rate * dt, rate * dt)
end

local function updateClimb(h: Humanoid, r: BasePart): boolean
	local s = stats()
	if s.climb <= 0 or os.clock() < climbCooldownUntil or h.Sit then
		ClientState.climbing = false
		return false
	end
	local dir = moveDir()
	local look = if dir.Magnitude > 0.1 then dir else Vector3.new(r.CFrame.LookVector.X, 0, r.CFrame.LookVector.Z).Unit
	local reach = r.Size.Z * 0.5 + 2.2 * s.scale
	local chest = cast(r.Position, look * reach)
	local wall = chest and math.abs(chest.Normal.Y) < 0.45
	if not wall or not chest then
		if ClientState.climbing then
			-- ran out of wall: mantle over the top
			ClientState.climbing = false
			r.AssemblyLinearVelocity = look * 28 + Vector3.new(0, 48, 0)
			ClientState.addFlow(0.12)
			climbCooldownUntil = os.clock() + 0.3
		end
		return false
	end
	local pushing = dir.Magnitude > 0.1 and dir:Dot(-chest.Normal) > 0.55
	if not ClientState.climbing then
		if not pushing then
			return false
		end
		if not airborne(h) and not ClientState.sprinting and r.AssemblyLinearVelocity.Magnitude < 4 then
			-- standing still against a wall: one push starts the climb
			r.AssemblyLinearVelocity += Vector3.new(0, 20, 0)
		end
		ClientState.climbing = true
		airJumpsLeft = s.airJumps + (if skill("leap") >= 2 then 1 else 0)
	end
	wallNormal = chest.Normal
	-- head clear above the ledge? then mantle
	local headY = r.Size.Y * 0.5 + 2.6 * s.scale
	local head = cast(r.Position + Vector3.new(0, headY, 0), -chest.Normal * (reach + 1))
	if not head then
		ClientState.climbing = false
		r.AssemblyLinearVelocity = -chest.Normal * 30 + Vector3.new(0, 52, 0)
		ClientState.addFlow(0.15)
		climbCooldownUntil = os.clock() + 0.35
		return false
	end
	local lateral = dir - (-chest.Normal) * dir:Dot(-chest.Normal)
	local climbSpeed = if pushing then s.climb * (1 + ClientState.flow * 0.3) else -6
	r.AssemblyLinearVelocity = -chest.Normal * 6 + Vector3.new(0, climbSpeed, 0) + lateral * s.climb * 0.6
	local p = r.Position
	r.CFrame = CFrame.lookAt(p, p - Vector3.new(chest.Normal.X, 0, chest.Normal.Z))
	return true
end

local function updateWallRun(dt: number, h: Humanoid, r: BasePart): boolean
	local s = stats()
	if not airborne(h) or os.clock() < wallRunCooldownUntil or not ClientState.sprinting then
		if ClientState.wallRunSide ~= 0 and not airborne(h) then
			wallRunCooldownUntil = os.clock() + 0.2
		end
		ClientState.wallRunSide = 0
		return false
	end
	local v = r.AssemblyLinearVelocity
	local flat = Vector3.new(v.X, 0, v.Z)
	if flat.Magnitude < 24 and ClientState.wallRunSide == 0 then
		return false
	end
	local fwd = if flat.Magnitude > 1 then flat.Unit else flatLook()
	local right = fwd:Cross(Vector3.yAxis)
	local reach = r.Size.X * 0.5 + 2.5 * s.scale
	local side = 0
	local hit = cast(r.Position, right * reach)
	if hit and math.abs(hit.Normal.Y) < 0.3 then
		side = 1
	else
		hit = cast(r.Position, -right * reach)
		if hit and math.abs(hit.Normal.Y) < 0.3 then
			side = -1
		end
	end
	if side == 0 or not hit then
		if ClientState.wallRunSide ~= 0 then
			wallRunCooldownUntil = os.clock() + 0.3
		end
		ClientState.wallRunSide = 0
		return false
	end
	if ClientState.wallRunSide == 0 then
		wallRunT = 0
		ClientState.addFlow(0.15)
		airJumpsLeft = math.max(airJumpsLeft, 1)
	end
	wallRunT += dt
	if wallRunT > s.wallRun then
		ClientState.wallRunSide = 0
		wallRunCooldownUntil = os.clock() + 0.6
		return false
	end
	ClientState.wallRunSide = side
	wallNormal = hit.Normal
	local along = fwd - hit.Normal * fwd:Dot(hit.Normal)
	along = if along.Magnitude > 0.01 then along.Unit else fwd
	local speed = math.max(flat.Magnitude, s.sprint * 0.85)
	local lift = 14 * (1 - wallRunT / s.wallRun) - 4
	r.AssemblyLinearVelocity = along * speed - hit.Normal * 4 + Vector3.new(0, lift, 0)
	local p = r.Position
	r.CFrame = CFrame.lookAt(p, p + along)
	return true
end

local function onLanded(r: BasePart)
	local drop = fallStartY - r.Position.Y
	airJumpsLeft = stats().airJumps + (if skill("leap") >= 2 then 1 else 0)
	if ClientState.diving then
		ClientState.diving = false
		Net.event("Attack"):FireServer("slam", flatLook())
		ClientState.shake(0.6)
		return
	end
	if drop > 30 and form() ~= "human" then
		ClientState.shake(math.clamp(drop / 150, 0.15, 0.5))
		if ClientState.sprinting then
			ClientState.addFlow(0.1) -- rolled out of a big drop at speed
		end
	end
end

local function step(dt: number)
	local h, r = humanoid, root
	if not h or not r or h.Health <= 0 then
		return
	end
	updateSpeed(dt, h)

	ClientState.flow = math.max(0, ClientState.flow - dt * (if ClientState.sprinting then 0.12 else 0.4))

	local air = airborne(h)
	if air and not wasAirborne then
		leftGroundAt = os.clock()
		fallStartY = r.Position.Y
	elseif air then
		fallStartY = math.max(fallStartY, r.Position.Y)
	elseif not air and wasAirborne then
		onLanded(r)
	end
	wasAirborne = air

	if ClientState.diving then
		h.AutoRotate = true
		return
	end
	local climbing = updateClimb(h, r)
	local running = not climbing and updateWallRun(dt, h, r)
	h.AutoRotate = not climbing and not running
end

---------------------------------------------------------------- input

local function onJumpRequest()
	local h, r = humanoid, root
	if not h or not r or ClientState.menuOpen then
		return
	end
	if ClientState.climbing or ClientState.wallRunSide ~= 0 then
		wallJump()
	elseif airborne(h) then
		airJump()
	end
end

local function onStateChanged(_old: Enum.HumanoidStateType, new: Enum.HumanoidStateType)
	local h, r = humanoid, root
	if not h or not r then
		return
	end
	if new == Enum.HumanoidStateType.Jumping then
		-- running leap: monster forms carry their speed into the jump
		local f = form()
		if f ~= "human" and ClientState.sprinting then
			local dir = h.MoveDirection
			local power = (1 + 0.2 * skill("leap")) * (if f == "wolf" then 0.55 else 0.45)
			r.AssemblyLinearVelocity += dir * h.WalkSpeed * power + Vector3.new(0, 8, 0)
			ClientState.kick(6)
			ClientState.addFlow(0.06)
		end
	end
end

local function bindCharacter(c: Model)
	character = c
	local h = c:WaitForChild("Humanoid", 10)
	local r = c:WaitForChild("HumanoidRootPart", 10)
	if not h or not h:IsA("Humanoid") or not r or not r:IsA("BasePart") then
		return
	end
	humanoid = h
	root = r
	ClientState.climbing = false
	ClientState.wallRunSide = 0
	ClientState.diving = false
	ClientState.flow = 0
	airJumpsLeft = 0
	h.StateChanged:Connect(onStateChanged)
end

function Movement.start()
	player.CharacterAdded:Connect(bindCharacter)
	if player.Character then
		task.spawn(bindCharacter, player.Character)
	end
	UserInputService.JumpRequest:Connect(onJumpRequest)

	ContextActionService:BindAction("LycanSprint", function(_, state, input)
		if input.KeyCode == Enum.KeyCode.ButtonL3 then
			if state == Enum.UserInputState.Begin then
				sprintToggle = not sprintToggle
			end
		else
			sprintHeld = state == Enum.UserInputState.Begin
		end
		return Enum.ContextActionResult.Pass
	end, true, Enum.KeyCode.LeftShift, Enum.KeyCode.ButtonL3)
	ContextActionService:SetTitle("LycanSprint", "Run")
	ContextActionService:SetPosition("LycanSprint", UDim2.new(1, -170, 1, -110))

	ContextActionService:BindAction("LycanDash", function(_, state)
		if state == Enum.UserInputState.Begin and not ClientState.menuOpen then
			dash()
		end
		return Enum.ContextActionResult.Sink
	end, true, Enum.KeyCode.C, Enum.KeyCode.LeftControl, Enum.KeyCode.ButtonB)
	ContextActionService:SetTitle("LycanDash", "Dash")
	ContextActionService:SetPosition("LycanDash", UDim2.new(1, -230, 1, -60))

	RunService.Heartbeat:Connect(step)
end

return Movement
