--!strict
-- Pure time-of-day and moon-phase helpers shared by server and client.

local Config = require(script.Parent.Config)

local Moon = {}

local PHASE_NAMES = { "Waxing Moon", "Gibbous Moon", "FULL MOON" }

function Moon.isNight(clock: number): boolean
	return clock >= 19.5 or clock < 5.5
end

-- The night belongs to the day it started on: 02:00 on day 4 is still night 3.
function Moon.nightIndex(day: number, clock: number): number
	return if clock < 12 then day - 1 else day
end

function Moon.isFullMoon(day: number, clock: number): boolean
	return Moon.nightIndex(day, clock) % Config.FULL_MOON_EVERY == Config.FULL_MOON_EVERY - 1
end

-- True only while it is night AND the moon is full: the moon forces the change.
function Moon.forcesChange(day: number, clock: number): boolean
	return Moon.isNight(clock) and Moon.isFullMoon(day, clock)
end

function Moon.phaseName(day: number, clock: number): string
	local i = Moon.nightIndex(day, clock) % Config.FULL_MOON_EVERY
	return PHASE_NAMES[math.clamp(i + 1, 1, #PHASE_NAMES)]
end

function Moon.formatClock(clock: number): string
	local h = math.floor(clock) % 24
	local m = math.floor((clock % 1) * 60)
	return string.format("%02d:%02d", h, m)
end

-- Darkness 0 (noon) .. 1 (midnight), smooth through dusk and dawn.
function Moon.nightFactor(clock: number): number
	local sun = math.cos((clock - 12) / 24 * math.pi * 2) -- 1 at noon, -1 at midnight
	return math.clamp(0.5 - sun * 0.9, 0, 1)
end

return Moon
