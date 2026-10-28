--!strict
-- The shape of Greyhaven, shared so the server can build it and the client
-- can name districts and draw the map. Units are studs; +Z is south.

local WorldLayout = {}

WorldLayout.HALF = 1200 -- the world spans -HALF..HALF on X and Z
WorldLayout.CITY_HALF = 420 -- the street grid spans -CITY_HALF..CITY_HALF
WorldLayout.BLOCK = 84 -- road spacing
WorldLayout.ROAD = 22 -- road width
WorldLayout.DOWNTOWN = 210 -- radius of the tall downtown core
WorldLayout.PLAZA = 70 -- radius of the open central plaza
WorldLayout.WATER_LEVEL = -3
WorldLayout.LAKE = { x = 780, z = -150, r = 230 }
WorldLayout.MOUNTAIN_Z = -930 -- mountains rise north of this line

WorldLayout.LANDMARKS = table.freeze({
	plaza = Vector3.new(0, 0, 0),
	safehouse = Vector3.new(42, 0, 126),
	cathedral = Vector3.new(-660, 0, 250),
	cemetery = Vector3.new(-250, 0, 640),
	ruins = Vector3.new(-600, 0, -650),
	lodge = Vector3.new(780, 0, 620),
	den = Vector3.new(-950, 0, -700),
	summit = Vector3.new(120, 0, -1080),
})

-- Vampire nests that hold districts; destroying one frees the district.
WorldLayout.NESTS = table.freeze({
	{ id = "nest_docks", name = "Docks", pos = Vector3.new(360, 0, -330) },
	{ id = "nest_oldtown", name = "Old Town", pos = Vector3.new(-330, 0, 330) },
	{ id = "nest_cathedral", name = "Cathedral Hill", pos = Vector3.new(-700, 0, 300) },
})

function WorldLayout.inCity(x: number, z: number): boolean
	local h = WorldLayout.CITY_HALF + 30
	return math.abs(x) < h and math.abs(z) < h
end

function WorldLayout.inLake(x: number, z: number, pad: number?): boolean
	local L = WorldLayout.LAKE
	local dx, dz = x - L.x, z - L.z
	local r = L.r + (pad or 0)
	return dx * dx + dz * dz < r * r
end

function WorldLayout.district(pos: Vector3): string
	local x, z = pos.X, pos.Z
	local function near(p: Vector3, r: number): boolean
		return (Vector3.new(x, 0, z) - Vector3.new(p.X, 0, p.Z)).Magnitude < r
	end
	local L = WorldLayout.LANDMARKS
	if near(L.plaza, WorldLayout.PLAZA + 20) then
		return "Lantern Plaza"
	elseif near(L.cathedral, 140) then
		return "Cathedral Hill"
	elseif near(L.cemetery, 140) then
		return "Ashgrove Cemetery"
	elseif near(L.ruins, 160) then
		return "The Old Ruins"
	elseif near(L.den, 160) then
		return "Vargr's Den"
	elseif near(L.lodge, 140) then
		return "Hunter's Lodge"
	elseif WorldLayout.inLake(x, z, 60) then
		return "Mirror Lake"
	elseif z < WorldLayout.MOUNTAIN_Z then
		return "Ashen Peaks"
	elseif WorldLayout.inCity(x, z) then
		if math.sqrt(x * x + z * z) < WorldLayout.DOWNTOWN then
			return "Downtown Greyhaven"
		elseif x > 0 and z < 0 then
			return "The Docks"
		elseif x < 0 and z > 0 then
			return "Old Town"
		elseif x < 0 then
			return "Northside"
		end
		return "Southbank"
	end
	return "Greywood Forest"
end

return WorldLayout
