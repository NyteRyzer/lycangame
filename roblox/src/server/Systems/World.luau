--!strict
-- Builds Greyhaven once at startup and exposes what other systems need
-- (spawn points, moonstones, vantages, nests).

local WorldGen = require(script.Parent.Parent.Lib.WorldGen)

local World = {}

World.built = nil :: WorldGen.Built?

function World.get(): WorldGen.Built
	local built = World.built
	assert(built, "World not built yet")
	return built
end

World.groundY = WorldGen.groundY

function World.init()
	local t = os.clock()
	World.built = WorldGen.build()
	print(string.format("[World] Greyhaven generated in %.2fs", os.clock() - t))
end

return World
