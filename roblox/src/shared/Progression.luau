--!strict
-- Pure progression math shared by the server (authoritative) and the HUD.

local Config = require(script.Parent.Config)

local Progression = {}

function Progression.xpForLevel(level: number): number
	return math.floor(Config.XP_BASE * level ^ 1.35)
end

function Progression.title(morality: number): string
	for _, entry in Config.TITLES do
		if morality >= entry.min then
			return entry.title
		end
	end
	return Config.TITLES[#Config.TITLES].title
end

-- Speed multiplier for monster forms from Swift Paws.
function Progression.speedMul(form: string, swiftRank: number): number
	if form == "human" then
		return 1
	end
	return 1 + 0.1 * swiftRank
end

return Progression
