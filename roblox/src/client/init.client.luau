--!strict
-- LYCAN client entry point. Controllers only render state and send requests;
-- the server decides everything that matters.

local Controllers = script:WaitForChild("Controllers")

local ORDER = { "Effects", "CameraRig", "Movement", "Combat", "Senses", "HUD" }

type Controller = { init: (() -> ())?, start: (() -> ())? }

local loaded: { { name: string, controller: Controller } } = {}
for _, name in ORDER do
	local module = Controllers:WaitForChild(name)
	assert(module:IsA("ModuleScript"), "missing controller " .. name)
	table.insert(loaded, { name = name, controller = require(module) :: any })
end

for _, entry in loaded do
	local init = entry.controller.init
	if init then
		init()
	end
end

for _, entry in loaded do
	local start = entry.controller.start
	if start then
		task.spawn(function()
			local ok, err = pcall(start)
			if not ok then
				warn(string.format("[LYCAN] %s.start failed: %s", entry.name, tostring(err)))
			end
		end)
	end
end

print("[LYCAN] client started")
