--!strict
-- Remote registry. The server creates every remote in one folder; clients
-- only wait for them. Names are public, so nothing here is privileged.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local FOLDER_NAME = "LycanRemotes"

local NAMES = {
	-- client -> server requests (all validated + rate limited on the server)
	"Transform", -- (form: string)
	"Attack", -- (kind: string, aim: Vector3)
	"Action", -- (action: string, arg: any)
	-- server -> client
	"Fx", -- (kind: string, data: table) cosmetic effects for everyone
	"Notify", -- (kind: string, text: string) toasts and banners for one player
}

local Net = {}

local folder: Folder

local function getFolder(): Folder
	if folder then
		return folder
	end
	if RunService:IsServer() then
		local existing = ReplicatedStorage:FindFirstChild(FOLDER_NAME)
		if existing and existing:IsA("Folder") then
			folder = existing
		else
			local f = Instance.new("Folder")
			f.Name = FOLDER_NAME
			for _, name in NAMES do
				local remote = Instance.new("RemoteEvent")
				remote.Name = name
				remote.Parent = f
			end
			f.Parent = ReplicatedStorage
			folder = f
		end
	else
		folder = ReplicatedStorage:WaitForChild(FOLDER_NAME) :: Folder
	end
	return folder
end

function Net.event(name: string): RemoteEvent
	local f = getFolder()
	local remote = if RunService:IsServer() then f:FindFirstChild(name) else f:WaitForChild(name)
	assert(remote and remote:IsA("RemoteEvent"), "unknown remote " .. name)
	return remote
end

return Net
