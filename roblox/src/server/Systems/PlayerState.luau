--!strict
-- Authoritative per-player state: form and transformation, rage, frenzy,
-- block / parry / dodge windows, combo, XP, levels and skills. Everything the
-- HUD needs is mirrored onto Player attributes (read-only for clients).

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local Types = require(Shared.Types)
local Net = require(Shared.Net)
local Moon = require(Shared.Moon)
local Progression = require(Shared.Progression)
local Lib = script.Parent.Parent.Lib
local Bus = require(Lib.Bus)
local RateLimit = require(Lib.RateLimit)
local WerewolfLook = require(Lib.WerewolfLook)
local Data = require(script.Parent.Data)

type FormKey = Types.FormKey

export type State = {
	player: Player,
	form: FormKey,
	transforming: boolean,
	transformReadyAt: number,
	rage: number,
	frenzyUntil: number,
	blocking: boolean,
	blockStart: number,
	iframesUntil: number,
	combo: number,
	comboAt: number,
	lastCombatAt: number,
	original: HumanoidDescription?,
	lookToken: number,
	moonForced: boolean,
}

export type DamageInfo = {
	silver: boolean?,
	attacker: Model?,
	unblockable: boolean?,
}

local states: { [Player]: State } = {}
local fx: RemoteEvent
local notify: RemoteEvent

local PlayerState = {}

local function now(): number
	return os.clock()
end

function PlayerState.get(player: Player): State?
	return states[player]
end

function PlayerState.skill(player: Player, id: string): number
	local profile = Data.get(player)
	if not profile then
		return 0
	end
	return profile.skills[id] or 0
end

function PlayerState.toast(player: Player, text: string)
	notify:FireClient(player, "toast", text)
end

local function humanoidOf(player: Player): (Humanoid?, BasePart?)
	local character = player.Character
	if not character then
		return nil, nil
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	local root = character:FindFirstChild("HumanoidRootPart")
	if humanoid and humanoid.Health > 0 and root and root:IsA("BasePart") then
		return humanoid, root
	end
	return nil, nil
end
PlayerState.humanoidOf = humanoidOf

---------------------------------------------------------------- attributes

local function syncProgress(player: Player)
	local profile = Data.get(player)
	if not profile then
		return
	end
	player:SetAttribute("Level", profile.level)
	player:SetAttribute("XP", profile.xp)
	player:SetAttribute("XPNext", Progression.xpForLevel(profile.level))
	player:SetAttribute("SkillPoints", profile.skillPoints)
	for id in Config.SKILLS do
		player:SetAttribute("Skill_" .. id, profile.skills[id] or 0)
	end
end
PlayerState.syncProgress = syncProgress

local function applyStats(player: Player, keepFraction: boolean)
	local state = states[player]
	local humanoid = humanoidOf(player)
	if not state or not humanoid then
		return
	end
	local stats = Config.FORMS[state.form]
	local hide = PlayerState.skill(player, "hide")
	local frac = if keepFraction then humanoid.Health / math.max(1, humanoid.MaxHealth) else 1
	humanoid.MaxHealth = stats.maxHealth * (1 + 0.05 * hide)
	humanoid.Health = math.max(1, humanoid.MaxHealth * frac)
	humanoid.UseJumpPower = true
	humanoid.JumpPower = stats.jump * (1 + 0.2 * PlayerState.skill(player, "leap"))
	humanoid.WalkSpeed = stats.walk * Progression.speedMul(state.form, PlayerState.skill(player, "swift"))
end

---------------------------------------------------------------- transformation

function PlayerState.transform(player: Player, target: FormKey, forced: boolean?): boolean
	local state = states[player]
	local humanoid = humanoidOf(player)
	local character = player.Character
	if not state or not humanoid or not character then
		return false
	end
	if state.transforming or state.form == target then
		return false
	end
	if not forced and now() < state.transformReadyAt then
		return false
	end
	if target == "human" and state.moonForced and PlayerState.skill(player, "leash") == 0 then
		PlayerState.toast(player, "The full moon will not let you go. (Moon's Leash resists it.)")
		return false
	end

	state.transforming = true
	state.lookToken += 1
	local token = state.lookToken
	local from = state.form
	player:SetAttribute("Transforming", true)
	fx:FireAllClients("transform", { character = character, from = from, to = target, forced = forced == true })

	task.spawn(function()
		task.wait(Config.TRANSFORM_TIME * 0.45)
		if state.lookToken ~= token or player.Character ~= character then
			return
		end
		WerewolfLook.apply(character, target, state.original)
		if state.lookToken ~= token or player.Character ~= character then
			return
		end
		state.form = target
		player:SetAttribute("Form", target)
		applyStats(player, true)
		task.wait(Config.TRANSFORM_TIME * 0.55)
		if state.lookToken ~= token then
			return
		end
		state.transforming = false
		state.transformReadyAt = now() + Config.TRANSFORM_COOLDOWN
		player:SetAttribute("Transforming", false)
		Bus.emit("Transformed", player, from, target)
	end)
	return true
end

-- Called by DayNight when the full moon rises or sets.
function PlayerState.setMoonForced(active: boolean)
	for player, state in states do
		state.moonForced = active
		player:SetAttribute("MoonForced", active)
		if active and state.form == "human" then
			PlayerState.toast(player, "The full moon rises. The change takes you.")
			PlayerState.transform(player, "wolf", true)
		end
	end
end

---------------------------------------------------------------- damage

-- Apply damage to a player after block, parry, dodge, armour and silver.
-- Returns what happened so the attacker can react (a parry stuns NPCs).
function PlayerState.damage(player: Player, amount: number, info: DamageInfo?): string
	local state = states[player]
	local humanoid, root = humanoidOf(player)
	if not state or not humanoid or not root then
		return "none"
	end
	local t = now()
	state.lastCombatAt = t
	if t < state.iframesUntil then
		fx:FireAllClients("dodge", { pos = root.Position })
		return "dodge"
	end
	local unblockable = info and info.unblockable
	if state.blocking and not unblockable then
		local window = Config.PARRY_WINDOW * (1 + 0.5 * PlayerState.skill(player, "parry"))
		if t - state.blockStart <= window then
			fx:FireAllClients("parry", { pos = root.Position })
			PlayerState.addRage(player, 12)
			return "parry"
		end
		amount *= 1 - Config.BLOCK_REDUCTION
		fx:FireAllClients("block", { pos = root.Position })
	end
	local stats = Config.FORMS[state.form]
	amount *= stats.damageTaken
	amount *= 1 - 0.12 * PlayerState.skill(player, "hide")
	if info and info.silver and state.form ~= "human" then
		amount *= 1.6 - 0.25 * PlayerState.skill(player, "silver")
	end
	if t < state.frenzyUntil then
		amount *= 0.7
	end
	amount = math.max(0, amount)
	humanoid.Health -= amount
	PlayerState.addRage(player, amount * 0.35)
	notify:FireClient(player, "hurt", tostring(math.floor(amount)))
	return if state.blocking and not unblockable then "block" else "hit"
end

function PlayerState.addRage(player: Player, n: number)
	local state = states[player]
	if not state then
		return
	end
	state.rage = math.clamp(state.rage + n, 0, Config.RAGE_MAX)
	player:SetAttribute("Rage", math.floor(state.rage))
end

-- Outgoing damage multiplier for the player's attacks right now.
function PlayerState.damageMul(player: Player): number
	local state = states[player]
	if not state then
		return 1
	end
	local mul = 1
	if now() < state.frenzyUntil then
		mul *= 1.5
	end
	mul *= 1 + math.min(state.combo, 30) * 0.01
	return mul
end

-- The player landed a hit: combo, rage and Bloodlust healing.
function PlayerState.onHit(player: Player, dealt: number)
	local state = states[player]
	local humanoid = humanoidOf(player)
	if not state or not humanoid then
		return
	end
	local t = now()
	state.lastCombatAt = t
	if t - state.comboAt > Config.COMBO_WINDOW then
		state.combo = 0
	end
	state.combo += 1
	state.comboAt = t
	player:SetAttribute("Combo", state.combo)
	PlayerState.addRage(player, Config.RAGE_PER_HIT)
	local heal = dealt * 0.05 * PlayerState.skill(player, "bloodlust")
	if t < state.frenzyUntil then
		heal += dealt * 0.1
	end
	if heal > 0 then
		humanoid.Health = math.min(humanoid.MaxHealth, humanoid.Health + heal)
	end
end

function PlayerState.startFrenzy(player: Player): boolean
	local state = states[player]
	if not state or state.form == "human" or state.rage < Config.RAGE_MAX then
		return false
	end
	local dur = Config.FRENZY_TIME + 4 * PlayerState.skill(player, "frenzy")
	state.frenzyUntil = now() + dur
	state.rage = 0
	player:SetAttribute("Rage", 0)
	player:SetAttribute("FrenzyUntil", workspace:GetServerTimeNow() + dur)
	local character = player.Character
	fx:FireAllClients("frenzy", { character = character })
	return true
end

function PlayerState.setBlocking(player: Player, on: boolean)
	local state = states[player]
	if not state or state.blocking == on then
		return
	end
	state.blocking = on
	if on then
		state.blockStart = now()
	end
	player:SetAttribute("Blocking", on)
end

function PlayerState.grantIFrames(player: Player, dur: number)
	local state = states[player]
	if state then
		state.iframesUntil = now() + dur
	end
end

---------------------------------------------------------------- progression

function PlayerState.addXP(player: Player, amount: number)
	local profile = Data.get(player)
	if not profile or amount <= 0 then
		return
	end
	profile.xp += math.floor(amount)
	local leveled = false
	while profile.xp >= Progression.xpForLevel(profile.level) do
		profile.xp -= Progression.xpForLevel(profile.level)
		profile.level += 1
		profile.skillPoints += 1
		leveled = true
	end
	syncProgress(player)
	if leveled then
		notify:FireClient(player, "banner", "LEVEL " .. profile.level .. "  ·  +1 skill point (Tab)")
		local humanoid = humanoidOf(player)
		if humanoid then
			humanoid.Health = humanoid.MaxHealth
		end
	end
end

function PlayerState.unlockSkill(player: Player, id: unknown)
	if typeof(id) ~= "string" then
		return
	end
	local def = Config.SKILLS[id]
	local profile = Data.get(player)
	if not def or not profile then
		return
	end
	local rank = profile.skills[id] or 0
	if rank >= def.max or profile.skillPoints < 1 then
		return
	end
	profile.skills[id] = rank + 1
	profile.skillPoints -= 1
	syncProgress(player)
	applyStats(player, true)
	PlayerState.toast(player, def.name .. " rank " .. (rank + 1))
end

---------------------------------------------------------------- lifecycle

local function onCharacter(player: Player, character: Model)
	local state = states[player]
	if not state then
		return
	end
	local humanoid = character:WaitForChild("Humanoid", 10)
	if not humanoid or not humanoid:IsA("Humanoid") then
		return
	end
	state.lookToken += 1
	state.form = "human"
	state.transforming = false
	state.combo = 0
	state.frenzyUntil = 0
	player:SetAttribute("Form", "human")
	player:SetAttribute("Transforming", false)
	player:SetAttribute("FrenzyUntil", 0)
	local ok, desc = pcall(function()
		return humanoid:GetAppliedDescription()
	end)
	state.original = if ok then desc else nil
	humanoid.BreakJointsOnDeath = false
	applyStats(player, false)
	if state.moonForced then
		task.delay(1.5, function()
			if player.Character == character then
				PlayerState.transform(player, "wolf", true)
			end
		end)
	end
end

local function onProfile(player: Player)
	local profile = Data.get(player)
	if not profile then
		return
	end
	syncProgress(player)
	applyStats(player, true)
end

local function onTransformRequest(player: Player, target: unknown)
	if not RateLimit.allow(player, "Transform", 2, 3) then
		return
	end
	if typeof(target) ~= "string" or not Config.FORMS[target :: any] then
		return
	end
	PlayerState.transform(player, target :: FormKey, false)
end

function PlayerState.init()
	fx = Net.event("Fx")
	notify = Net.event("Notify")
end

function PlayerState.start()
	local function added(player: Player)
		states[player] = {
			player = player,
			form = "human",
			transforming = false,
			transformReadyAt = 0,
			rage = 0,
			frenzyUntil = 0,
			blocking = false,
			blockStart = 0,
			iframesUntil = 0,
			combo = 0,
			comboAt = 0,
			lastCombatAt = 0,
			original = nil,
			lookToken = 0,
			moonForced = Moon.forcesChange(
				(workspace:GetAttribute("Day") :: number?) or 1,
				game:GetService("Lighting").ClockTime
			),
		}
		player:SetAttribute("Form", "human")
		player:SetAttribute("Rage", 0)
		player:SetAttribute("Combo", 0)
		player.CharacterAdded:Connect(function(c)
			onCharacter(player, c)
		end)
		if player.Character then
			task.spawn(onCharacter, player, player.Character)
		end
	end
	Players.PlayerAdded:Connect(added)
	for _, p in Players:GetPlayers() do
		added(p)
	end
	Players.PlayerRemoving:Connect(function(player)
		states[player] = nil
	end)
	Bus.on("ProfileLoaded", onProfile)
	Net.event("Transform").OnServerEvent:Connect(onTransformRequest)

	-- XP from kills (bonus for finishers and long combos)
	Bus.on("NPCKilled", function(player: Player?, npcType: string, _pos: Vector3, finisher: boolean)
		if not player then
			return
		end
		local def = Config.NPCS[npcType]
		local state = states[player]
		if not def or not state then
			return
		end
		local mul = 1 + math.min(state.combo, 20) * 0.05
		if finisher then
			mul *= 1.5
		end
		PlayerState.addXP(player, def.xp * mul)
	end)

	-- slow upkeep: combo expiry, rage decay, Lunar Vitality regen at night
	local acc = 0
	RunService.Heartbeat:Connect(function(dt)
		acc += dt
		if acc < 0.25 then
			return
		end
		local step = acc
		acc = 0
		local t = now()
		local night = Moon.isNight(game:GetService("Lighting").ClockTime)
		for player, state in states do
			if state.combo > 0 and t - state.comboAt > Config.COMBO_WINDOW then
				state.combo = 0
				player:SetAttribute("Combo", 0)
			end
			if t - state.lastCombatAt > 6 and state.rage > 0 and t >= state.frenzyUntil then
				PlayerState.addRage(player, -4 * step)
			end
			local humanoid = humanoidOf(player)
			if humanoid and t - state.lastCombatAt > 4 then
				local regen = if night then 0.03 else 0.008
				if state.form ~= "human" then
					regen *= 0.6
				end
				humanoid.Health = math.min(humanoid.MaxHealth, humanoid.Health + humanoid.MaxHealth * regen * step)
			end
		end
	end)
end

return PlayerState
