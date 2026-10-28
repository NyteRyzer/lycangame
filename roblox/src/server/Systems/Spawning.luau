--!strict
-- Characters load only once Greyhaven exists, and respawn at the safehouse a
-- few seconds after death.

local Players = game:GetService("Players")

local RESPAWN_DELAY = 4

local Spawning = {}

local function load(player: Player)
	if not player.Parent then
		return
	end
	local ok, err = pcall(function()
		player:LoadCharacter()
	end)
	if not ok then
		warn("[Spawning] LoadCharacter failed: " .. tostring(err))
	end
end

local function watch(player: Player)
	player.CharacterAdded:Connect(function(character)
		local humanoid = character:WaitForChild("Humanoid", 10)
		if humanoid and humanoid:IsA("Humanoid") then
			humanoid.Died:Connect(function()
				task.wait(RESPAWN_DELAY)
				if player.Character == character then
					load(player)
				end
			end)
		end
	end)
	load(player)
end

function Spawning.init()
	Players.CharacterAutoLoads = false
end

function Spawning.start()
	Players.PlayerAdded:Connect(watch)
	for _, p in Players:GetPlayers() do
		task.spawn(watch, p)
	end
end

return Spawning
