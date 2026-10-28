--!strict
-- Shared type definitions. Types that cross the client/server boundary
-- (remote payloads, profile schema) live here so both sides agree.

export type FormKey = "human" | "hybrid" | "wolf"

export type FormStats = {
	name: string,
	maxHealth: number,
	walk: number,
	sprint: number,
	jump: number,
	scale: number,
	climb: number,
	wallRun: number,
	airJumps: number,
	reach: number,
	light: number,
	heavy: number,
	damageTaken: number,
}

export type SkillDef = {
	name: string,
	max: number,
	desc: string,
}

export type NPCDef = {
	name: string,
	health: number,
	walk: number,
	run: number,
	damage: number,
	range: number,
	xp: number,
	ranged: boolean,
}

export type AttackKind = "light" | "heavy" | "slam"

export type Profile = {
	version: number,
	level: number,
	xp: number,
	skillPoints: number,
	skills: { [string]: number },
	morality: number,
	kills: { [string]: number },
	moonstones: { [string]: boolean },
	vantages: { [string]: boolean },
	nests: { [string]: boolean },
	story: number,
	alphaDefeated: boolean,
}

-- Effects the server broadcasts to every client (purely cosmetic).
export type FxKind = "swing" | "hit" | "howl" | "transform" | "slam" | "shot" | "parry" | "block" | "kill" | "collect"

return nil
