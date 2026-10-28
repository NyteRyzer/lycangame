--!strict
-- Day / night cycle and the moon. The day counter lives in a workspace
-- attribute so clients can show the phase. When the full moon rises every
-- player is forced into the beast.

local Lighting = game:GetService("Lighting")
local RunService = game:GetService("RunService")
local CollectionService = game:GetService("CollectionService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local Moon = require(Shared.Moon)
local PlayerState = require(script.Parent.PlayerState)

local DayNight = {}

local day = 1
local forced = false
local lampsOn: boolean? = nil

-- Skip ahead to the next dusk (from day) or dawn (from night). Used by the
-- safehouse bed.
function DayNight.skip()
	local clock = Lighting.ClockTime
	if Moon.isNight(clock) then
		if clock >= 19.5 then
			day += 1
		end
		Lighting.ClockTime = 6.5
	else
		Lighting.ClockTime = 19.6
	end
	workspace:SetAttribute("Day", day)
end

local function updateLook(clock: number)
	local n = Moon.nightFactor(clock)
	local full = Moon.isFullMoon(day, clock) and Moon.isNight(clock)
	Lighting.Brightness = 2.6 - n * 1.6
	Lighting.Ambient = Color3.fromRGB(70, 70, 90):Lerp(Color3.fromRGB(30, 34, 58), n)
	Lighting.OutdoorAmbient = Color3.fromRGB(130, 130, 140):Lerp(
		if full then Color3.fromRGB(80, 90, 140) else Color3.fromRGB(46, 52, 84),
		n
	)
	Lighting.ColorShift_Top = if full then Color3.fromRGB(70, 90, 160) else Color3.new(0, 0, 0)
	local sky = Lighting:FindFirstChildOfClass("Sky")
	if sky then
		sky.MoonAngularSize = if full then 26 else 12
	end
	local atmo = Lighting:FindFirstChildOfClass("Atmosphere")
	if atmo then
		atmo.Density = 0.3 + n * 0.12
		atmo.Color = Color3.fromRGB(190, 190, 200):Lerp(
			if full then Color3.fromRGB(120, 140, 200) else Color3.fromRGB(70, 74, 110),
			n
		)
	end
	local wantLamps = n > 0.45
	if wantLamps ~= lampsOn then
		lampsOn = wantLamps
		for _, lamp in CollectionService:GetTagged("StreetLamp") do
			local light = lamp:FindFirstChildOfClass("PointLight")
			if light then
				light.Enabled = wantLamps
			end
			if lamp:IsA("BasePart") then
				lamp.Material = if wantLamps then Enum.Material.Neon else Enum.Material.SmoothPlastic
			end
		end
	end
end

function DayNight.init()
	Lighting.ClockTime = Config.START_CLOCK
	workspace:SetAttribute("Day", day)
end

function DayNight.start()
	local hoursPerSecond = 24 / Config.DAY_LENGTH
	local acc = 0
	RunService.Heartbeat:Connect(function(dt)
		local before = Lighting.ClockTime
		local after = before + dt * hoursPerSecond
		if after >= 24 then
			after -= 24
			day += 1
			workspace:SetAttribute("Day", day)
		end
		Lighting.ClockTime = after
		acc += dt
		if acc < 0.5 then
			return
		end
		acc = 0
		updateLook(after)
		local nowForced = Moon.forcesChange(day, after)
		if nowForced ~= forced then
			forced = nowForced
			workspace:SetAttribute("FullMoon", forced)
			PlayerState.setMoonForced(forced)
		end
	end)
end

return DayNight
