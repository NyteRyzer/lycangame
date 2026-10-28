--!strict
-- Procedural attack animation layered on top of the default animations by
-- offsetting Motor6D.C0 for a fraction of a second. Works for any R15 rig
-- (players and NPCs) and needs no uploaded animation assets.

local RunService = game:GetService("RunService")

local Anim = {}

type Pose = { shoulder: Vector3, waist: Vector3 } -- euler angles in radians

local active: { [Motor6D]: { token: number, applied: CFrame } } = {}
local tokens = 0

local function motor(model: Model, partName: string, motorName: string): Motor6D?
	local part = model:FindFirstChild(partName)
	local m = part and part:FindFirstChild(motorName)
	return if m and m:IsA("Motor6D") then m else nil
end

-- Drive `m` through an offset curve f(alpha) -> CFrame over `dur` seconds,
-- removing the previous frame's offset each step so nothing drifts.
local function drive(m: Motor6D, dur: number, f: (number) -> CFrame)
	tokens += 1
	local token = tokens
	local prev = active[m]
	if prev then
		m.C0 = m.C0 * prev.applied:Inverse()
	end
	local entry = { token = token, applied = CFrame.identity }
	active[m] = entry
	local t = 0
	local conn: RBXScriptConnection
	conn = RunService.RenderStepped:Connect(function(dt)
		if entry.token ~= token or active[m] ~= entry or not m.Parent then
			conn:Disconnect()
			return
		end
		t += dt
		local a = math.clamp(t / dur, 0, 1)
		local offset = if a >= 1 then CFrame.identity else f(a)
		m.C0 = m.C0 * entry.applied:Inverse() * offset
		entry.applied = offset
		if a >= 1 then
			active[m] = nil
			conn:Disconnect()
		end
	end)
end

-- wind up quickly, strike hard, recover
local function curve(a: number): number
	if a < 0.25 then
		return -(a / 0.25) * 0.5
	elseif a < 0.45 then
		local b = (a - 0.25) / 0.2
		return -0.5 + b * 1.5
	end
	return 1 - (a - 0.45) / 0.55
end

function Anim.swing(model: Model, kind: string, side: number)
	local right = side ~= 0
	local shoulder = if right
		then motor(model, "RightUpperArm", "RightShoulder")
		else motor(model, "LeftUpperArm", "LeftShoulder")
	local waist = motor(model, "UpperTorso", "Waist")
	local dur = if kind == "heavy" then 0.5 else 0.3
	local sign = if right then 1 else -1
	if shoulder then
		drive(shoulder, dur, function(a)
			local c = curve(a)
			if kind == "punch" then
				return CFrame.new(0, 0, -0.5 * math.max(0, c)) * CFrame.Angles(math.rad(80) * math.max(0, c), 0, 0)
			elseif kind == "heavy" then
				return CFrame.Angles(math.rad(150) * c, 0, sign * math.rad(30) * c)
			end
			-- claw: a diagonal raking slash
			return CFrame.Angles(math.rad(110) * c, sign * math.rad(-40) * c, sign * math.rad(60) * c)
		end)
	end
	if waist then
		drive(waist, dur, function(a)
			local c = curve(a)
			return CFrame.Angles(math.rad(if kind == "heavy" then 18 else 8) * c, sign * math.rad(-28) * c, 0)
		end)
	end
end

-- Arms thrown back, chest out, head up: a howl.
function Anim.howl(model: Model)
	local neck = motor(model, "Head", "Neck")
	local l = motor(model, "LeftUpperArm", "LeftShoulder")
	local r = motor(model, "RightUpperArm", "RightShoulder")
	local function env(a: number): number
		return math.sin(math.min(a * 1.4, 1) * math.pi * 0.5) * (1 - math.max(0, a - 0.8) / 0.2)
	end
	if neck then
		drive(neck, 1.4, function(a)
			return CFrame.Angles(math.rad(50) * env(a), 0, 0)
		end)
	end
	for i, m in { l, r } do
		if m then
			local sign = if i == 1 then -1 else 1
			drive(m, 1.4, function(a)
				return CFrame.Angles(math.rad(-30) * env(a), 0, sign * math.rad(40) * env(a))
			end)
		end
	end
end

return Anim
