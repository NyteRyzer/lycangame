--!strict
-- LYCAN server entry point. Two-phase bootstrap: init() every system in
-- dependency order (the world is generated here), then start() them all.

local Systems = script:WaitForChild("Systems")

local ORDER = {
	"Data",
	"World",
	"PlayerState",
	"Reputation",
	"DayNight",
	"NPCs",
	"Combat",
	"Director",
	"Spawning",
}

type System = { init: (() -> ())?, start: (() -> ())? }

local loaded: { { name: string, system: System } } = {}
for _, name in ORDER do
	local module = Systems:FindFirstChild(name)
	assert(module and module:IsA("ModuleScript"), "missing system " .. name)
	table.insert(loaded, { name = name, system = require(module) :: any })
end

for _, entry in loaded do
	local init = entry.system.init
	if init then
		local ok, err = pcall(init)
		if not ok then
			warn(string.format("[LYCAN] %s.init failed: %s", entry.name, tostring(err)))
		end
	end
end

for _, entry in loaded do
	local start = entry.system.start
	if start then
		task.spawn(function()
			local ok, err = pcall(start)
			if not ok then
				warn(string.format("[LYCAN] %s.start failed: %s", entry.name, tostring(err)))
			end
		end)
	end
end

print("[LYCAN] server started")
