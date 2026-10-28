--!strict
-- Tunable gameplay values for LYCAN. Replicated to clients, so nothing here is
-- secret and the server never trusts a value a client reports from it: the
-- server looks every number up here itself.

local Types = require(script.Parent.Types)

export type FormKey = Types.FormKey

-- Per-form stats. Distances are studs (about 0.28 m each).
local FORMS: { [FormKey]: Types.FormStats } = {
	human = {
		name = "HUMAN",
		maxHealth = 100,
		walk = 16,
		sprint = 26,
		jump = 50,
		scale = 1,
		climb = 0,
		wallRun = 0.5,
		airJumps = 0,
		reach = 7,
		light = 8,
		heavy = 14,
		damageTaken = 1,
	},
	hybrid = {
		name = "HYBRID",
		maxHealth = 180,
		walk = 22,
		sprint = 48,
		jump = 75,
		scale = 1.22,
		climb = 34,
		wallRun = 1.6,
		airJumps = 1,
		reach = 10,
		light = 15,
		heavy = 32,
		damageTaken = 0.8,
	},
	wolf = {
		name = "BEAST",
		maxHealth = 260,
		walk = 28,
		sprint = 72,
		jump = 85,
		scale = 1.45,
		climb = 40,
		wallRun = 1.3,
		airJumps = 1,
		reach = 12,
		light = 20,
		heavy = 48,
		damageTaken = 0.65,
	},
}

local SKILLS: { [string]: Types.SkillDef } = {
	swift = { name = "Swift Paws", max = 3, desc = "+10% speed in hybrid and beast form per rank." },
	hide = { name = "Iron Hide", max = 3, desc = "-12% damage taken per rank." },
	bloodlust = { name = "Bloodlust", max = 2, desc = "Heal 5% of damage dealt per rank." },
	leap = { name = "Moon Leap", max = 2, desc = "+20% leap power. Rank 2: one more mid-air jump." },
	howl = { name = "Terrible Howl", max = 2, desc = "Howl stuns longer. Rank 2: wider, enemies take +30% damage." },
	silver = { name = "Silver Tolerance", max = 2, desc = "Reduces bonus damage from silver weapons." },
	leash = { name = "Moon's Leash", max = 1, desc = "Resist the full moon: you may return to human form during it." },
	parry = { name = "Riposte", max = 2, desc = "Wider parry window. Rank 2: parries stun twice as long." },
	frenzy = { name = "Blood Moon", max = 2, desc = "Frenzy lasts 4s longer per rank." },
}

local SKILL_ORDER = { "swift", "hide", "bloodlust", "leap", "howl", "silver", "leash", "parry", "frenzy" }

-- NPC archetypes. hostile: attacks the player on sight (police/hunters are
-- conditional and decided by the server's reputation system).
local NPCS: { [string]: Types.NPCDef } = {
	civilian = { name = "Civilian", health = 40, walk = 8, run = 20, damage = 0, range = 0, xp = 5, ranged = false },
	police = { name = "Officer", health = 80, walk = 10, run = 22, damage = 7, range = 80, xp = 15, ranged = true },
	hunter = { name = "Silver Hunter", health = 110, walk = 12, run = 24, damage = 12, range = 110, xp = 30, ranged = true },
	vampire = { name = "Vampire", health = 130, walk = 14, run = 34, damage = 14, range = 7, xp = 40, ranged = false },
	ghoul = { name = "Ghoul", health = 70, walk = 9, run = 16, damage = 9, range = 6, xp = 18, ranged = false },
	rival = { name = "Rival Wolf", health = 220, walk = 16, run = 40, damage = 18, range = 9, xp = 60, ranged = false },
	alpha = { name = "Alpha Vargr", health = 1400, walk = 18, run = 46, damage = 30, range = 12, xp = 500, ranged = false },
	deer = { name = "Deer", health = 30, walk = 10, run = 38, damage = 0, range = 0, xp = 8, ranged = false },
}

-- Morality change when the player kills each archetype.
local KILL_MORALITY: { [string]: number } = {
	civilian = -12,
	police = -8,
	hunter = -3,
	vampire = 6,
	ghoul = 3,
	rival = 2,
	alpha = 15,
	deer = 0,
}

local TITLES = {
	{ min = 60, title = "Guardian of Greyhaven" },
	{ min = 25, title = "Protector" },
	{ min = -25, title = "Wanderer" },
	{ min = -60, title = "Menace" },
	{ min = -101, title = "The Beast of Greyhaven" },
}

return table.freeze({
	FORMS = table.freeze(FORMS),
	FORM_ORDER = table.freeze({ "human", "hybrid", "wolf" } :: { FormKey }),
	SKILLS = table.freeze(SKILLS),
	SKILL_ORDER = table.freeze(SKILL_ORDER),
	NPCS = table.freeze(NPCS),
	KILL_MORALITY = table.freeze(KILL_MORALITY),
	TITLES = TITLES,

	TRANSFORM_TIME = 0.9,
	TRANSFORM_COOLDOWN = 1.5,
	DAY_LENGTH = 14 * 60, -- real seconds per in-game day
	FULL_MOON_EVERY = 3, -- nights
	START_CLOCK = 20.5,

	LIGHT_COOLDOWN = 0.28,
	HEAVY_COOLDOWN = 0.75,
	SLAM_COOLDOWN = 2.5,
	HOWL_COOLDOWN = 8,
	DASH_COOLDOWN = 0.7,
	DASH_IFRAMES = 0.3,
	PARRY_WINDOW = 0.22,
	BLOCK_REDUCTION = 0.7,
	COMBO_WINDOW = 2.2,
	FRENZY_TIME = 8,
	RAGE_PER_HIT = 6,
	RAGE_MAX = 100,
	HEAT_DECAY = 0.05, -- per second
	HEAT_DECAY_HUMAN = 0.15,
	FINISH_THRESHOLD = 0.25, -- fraction of max health
	GRAB_RANGE = 10,
	XP_BASE = 100,

	AUTOSAVE_INTERVAL = 60,

	-- Optional audio. Roblox requires audio you own or that is public, so the
	-- IDs below are empty: paste your own uploaded asset IDs ("rbxassetid://123")
	-- to replace the built-in fallback sounds.
	SOUNDS = table.freeze({
		howl = "",
		roar = "",
		ambientNight = "",
	}),
})
