--!strict
-- Procedural Greyhaven: terrain (forest hills, the Ashen Peaks, Mirror Lake),
-- the downtown street grid with lit-window towers, the plaza, landmarks
-- (cathedral, cemetery, ruins, hunter's lodge, the Alpha's den), throwable
-- street props, moonstones, vantage spires and vampire nests.
--
-- Everything is generated from a fixed seed so every server builds the same
-- city. Runs once on the server at startup.

local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local WorldLayout = require(Shared.WorldLayout)

local Terrain = workspace.Terrain
local rng = Random.new(1337)

local WorldGen = {}

export type Built = {
	moonstones: { BasePart },
	vantages: { BasePart },
	nests: { [string]: Model },
	spawn: SpawnLocation,
	roadPoints: { Vector3 },
	forestPoints: { Vector3 },
}

local root: Folder

local function folder(name: string, parent: Instance?): Folder
	local f = Instance.new("Folder")
	f.Name = name
	f.Parent = parent or root
	return f
end

type PartProps = {
	size: Vector3,
	cf: CFrame,
	color: Color3?,
	material: Enum.Material?,
	shape: Enum.PartType?,
	anchored: boolean?,
	collide: boolean?,
	transparency: number?,
	name: string?,
	class: string?,
}

local function part(p: PartProps, parent: Instance): BasePart
	local inst: BasePart
	if p.class == "WedgePart" then
		inst = Instance.new("WedgePart")
	elseif p.class == "CornerWedgePart" then
		inst = Instance.new("CornerWedgePart")
	else
		local pt = Instance.new("Part")
		if p.shape then
			pt.Shape = p.shape
		end
		inst = pt
	end
	inst.Size = p.size
	inst.CFrame = p.cf
	inst.Color = p.color or Color3.fromRGB(120, 120, 120)
	inst.Material = p.material or Enum.Material.SmoothPlastic
	inst.Anchored = if p.anchored == nil then true else p.anchored
	inst.CanCollide = if p.collide == nil then true else p.collide
	inst.Transparency = p.transparency or 0
	inst.TopSurface = Enum.SurfaceType.Smooth
	inst.BottomSurface = Enum.SurfaceType.Smooth
	if p.name then
		inst.Name = p.name
	end
	inst.Parent = parent
	return inst
end

local function rgb(r: number, g: number, b: number): Color3
	return Color3.fromRGB(r, g, b)
end

local function pick<T>(list: { T }): T
	return list[rng:NextInteger(1, #list)]
end

local groundParams = RaycastParams.new()
groundParams.FilterType = Enum.RaycastFilterType.Include
groundParams.FilterDescendantsInstances = { Terrain }

-- Height of the terrain surface (water counts as surface).
local function groundY(x: number, z: number): number
	local hit = workspace:Raycast(Vector3.new(x, 900, z), Vector3.new(0, -1200, 0), groundParams)
	return if hit then hit.Position.Y else 0
end

local function nearLandmark(x: number, z: number, pad: number): boolean
	for _, p in WorldLayout.LANDMARKS do
		if (Vector3.new(x, 0, z) - p).Magnitude < pad then
			return true
		end
	end
	return false
end

---------------------------------------------------------------- terrain

local function buildTerrain()
	local H = WorldLayout.HALF
	-- base slab in tiles so each call stays small
	local tile = H / 2
	for ix = -2, 1 do
		for iz = -2, 1 do
			local cx = (ix + 0.5) * tile
			local cz = (iz + 0.5) * tile
			Terrain:FillBlock(CFrame.new(cx, -12, cz), Vector3.new(tile, 24, tile), Enum.Material.Grass)
		end
	end
	-- city floor
	local C = WorldLayout.CITY_HALF + 40
	Terrain:FillBlock(CFrame.new(0, -2, 0), Vector3.new(C * 2, 4, C * 2), Enum.Material.Asphalt)

	-- rolling forest hills (kept away from the city, lake and landmark sites)
	for _ = 1, 140 do
		local x = rng:NextNumber(-H + 40, H - 40)
		local z = rng:NextNumber(WorldLayout.MOUNTAIN_Z + 60, H - 40)
		if not WorldLayout.inCity(x, z) and not WorldLayout.inLake(x, z, 140) and not nearLandmark(x, z, 170) then
			local r = rng:NextNumber(50, 130)
			if math.abs(x) - r > WorldLayout.CITY_HALF + 40 or math.abs(z) - r > WorldLayout.CITY_HALF + 40 then
				Terrain:FillBall(Vector3.new(x, -r * 0.78, z), r, Enum.Material.Grass)
			end
		end
	end

	-- the Ashen Peaks along the north edge
	for i = 0, 26 do
		local x = -H + i * (2 * H / 26) + rng:NextNumber(-40, 40)
		local z = rng:NextNumber(-H + 20, -H + 90)
		local r = rng:NextNumber(150, 280)
		Terrain:FillBall(Vector3.new(x, -r * 0.35, z), r, Enum.Material.Rock)
		Terrain:FillBall(Vector3.new(x, r * 0.52, z), r * 0.22, Enum.Material.Snow)
	end
	-- the summit, with a flattened top for the vantage cairn
	local S = WorldLayout.LANDMARKS.summit
	Terrain:FillBall(Vector3.new(S.X, -120, S.Z), 420, Enum.Material.Rock)
	Terrain:FillBall(Vector3.new(S.X, 220, S.Z), 110, Enum.Material.Snow)
	Terrain:FillBlock(CFrame.new(S.X, 312, S.Z), Vector3.new(80, 24, 80), Enum.Material.Air)

	-- Mirror Lake
	local L = WorldLayout.LAKE
	Terrain:FillCylinder(CFrame.new(L.x, -2, L.z), 4, L.r + 36, Enum.Material.Sand)
	Terrain:FillCylinder(CFrame.new(L.x, -9, L.z), 18, L.r, Enum.Material.Air)
	Terrain:FillCylinder(CFrame.new(L.x, -19, L.z), 2, L.r, Enum.Material.Sand)
	Terrain:FillCylinder(CFrame.new(L.x, -11, L.z), 16, L.r, Enum.Material.Water)

	-- dirt trails from the city edge to each landmark
	local function trail(a: Vector3, b: Vector3)
		local mid = (a + b) / 2
		local len = (b - a).Magnitude
		local cf = CFrame.lookAt(Vector3.new(mid.X, -1, mid.Z), Vector3.new(b.X, -1, b.Z))
		Terrain:FillBlock(cf, Vector3.new(14, 3, len), Enum.Material.Mud)
	end
	local LM = WorldLayout.LANDMARKS
	local edge = WorldLayout.CITY_HALF + 20
	trail(Vector3.new(-edge, 0, 250), LM.cathedral)
	trail(Vector3.new(-250, 0, edge), LM.cemetery)
	trail(Vector3.new(-edge, 0, -edge), LM.ruins)
	trail(LM.ruins, LM.den)
	trail(Vector3.new(edge, 0, edge), LM.lodge)
	trail(Vector3.new(120, 0, -edge), Vector3.new(120, 0, WorldLayout.MOUNTAIN_Z))
end

---------------------------------------------------------------- city

local FACADES = {
	{ color = rgb(92, 88, 84), material = Enum.Material.Concrete },
	{ color = rgb(110, 62, 48), material = Enum.Material.Brick },
	{ color = rgb(70, 76, 88), material = Enum.Material.Slate },
	{ color = rgb(58, 64, 72), material = Enum.Material.Concrete },
	{ color = rgb(128, 116, 98), material = Enum.Material.Limestone },
	{ color = rgb(46, 52, 60), material = Enum.Material.Metal },
}
local LIT = { rgb(255, 205, 130), rgb(255, 225, 170), rgb(250, 185, 110), rgb(190, 220, 255) }
local NEON = { rgb(255, 60, 90), rgb(60, 220, 255), rgb(170, 90, 255), rgb(255, 160, 40) }

local function windows(b: BasePart, floors: number, parent: Instance)
	local size = b.Size
	local base = b.CFrame * CFrame.new(0, -size.Y / 2, 0)
	local faces = {
		{ off = Vector3.new(0, 0, -size.Z / 2 - 0.15), w = size.X, rot = CFrame.new() },
		{ off = Vector3.new(0, 0, size.Z / 2 + 0.15), w = size.X, rot = CFrame.new() },
		{ off = Vector3.new(-size.X / 2 - 0.15, 0, 0), w = size.Z, rot = CFrame.Angles(0, math.pi / 2, 0) },
		{ off = Vector3.new(size.X / 2 + 0.15, 0, 0), w = size.Z, rot = CFrame.Angles(0, math.pi / 2, 0) },
	}
	local floorH = (size.Y - 6) / floors
	for _, f in faces do
		for i = 1, floors do
			local y = 4 + (i - 0.5) * floorH
			local lit = rng:NextNumber() < 0.45
			part({
				size = Vector3.new(f.w * 0.86, floorH * 0.45, 0.3),
				cf = base * CFrame.new(f.off + Vector3.new(0, y, 0)) * f.rot,
				color = if lit then pick(LIT) else rgb(22, 28, 38),
				material = if lit then Enum.Material.Neon else Enum.Material.Glass,
				collide = false,
				name = "Window",
			}, parent)
		end
	end
end

local function building(x: number, z: number, w: number, d: number, h: number, parent: Instance): BasePart
	local style = pick(FACADES)
	local model = Instance.new("Model")
	model.Name = "Building"
	model.Parent = parent
	local b = part({
		size = Vector3.new(w, h, d),
		cf = CFrame.new(x, h / 2 + 0.8, z),
		color = style.color,
		material = style.material,
		name = "Tower",
	}, model)
	CollectionService:AddTag(b, "Climbable")
	-- roof ledge
	part({
		size = Vector3.new(w + 1.6, 1.4, d + 1.6),
		cf = CFrame.new(x, h + 1.5, z),
		color = style.color:Lerp(rgb(0, 0, 0), 0.3),
		material = style.material,
		name = "Ledge",
	}, model)
	-- ground-floor storefront band
	part({
		size = Vector3.new(w + 0.4, 5, d + 0.4),
		cf = CFrame.new(x, 3.3, z),
		color = rgb(30, 30, 34),
		material = Enum.Material.Glass,
		name = "Storefront",
	}, model)
	windows(b, math.clamp(math.floor(h / 12), 2, 22), model)
	-- rooftop clutter: water tower, AC units, antenna, neon sign
	local top = h + 2.2
	local r = rng:NextNumber()
	if r < 0.3 and h < 160 then
		local tx, tz = x + rng:NextNumber(-w / 4, w / 4), z + rng:NextNumber(-d / 4, d / 4)
		for _, o in { Vector3.new(-3, 0, -3), Vector3.new(3, 0, -3), Vector3.new(-3, 0, 3), Vector3.new(3, 0, 3) } do
			part({
				size = Vector3.new(0.8, 8, 0.8),
				cf = CFrame.new(tx + o.X, top + 4, tz + o.Z),
				color = rgb(60, 40, 30),
				material = Enum.Material.Wood,
			}, model)
		end
		part({
			size = Vector3.new(10, 10, 10),
			cf = CFrame.new(tx, top + 13, tz) * CFrame.Angles(0, 0, math.pi / 2),
			color = rgb(96, 64, 44),
			material = Enum.Material.WoodPlanks,
			shape = Enum.PartType.Cylinder,
		}, model)
	elseif r < 0.6 then
		for _ = 1, rng:NextInteger(1, 3) do
			part({
				size = Vector3.new(5, 3, 4),
				cf = CFrame.new(x + rng:NextNumber(-w / 3, w / 3), top + 1.5, z + rng:NextNumber(-d / 3, d / 3)),
				color = rgb(150, 150, 150),
				material = Enum.Material.DiamondPlate,
			}, model)
		end
	elseif h > 120 then
		part({
			size = Vector3.new(0.8, 30, 0.8),
			cf = CFrame.new(x, top + 15, z),
			color = rgb(80, 80, 80),
			material = Enum.Material.Metal,
		}, model)
		local beacon = part({
			size = Vector3.new(1.6, 1.6, 1.6),
			cf = CFrame.new(x, top + 30.5, z),
			color = rgb(255, 40, 40),
			material = Enum.Material.Neon,
			shape = Enum.PartType.Ball,
			collide = false,
		}, model)
		beacon.Name = "Beacon"
	end
	if rng:NextNumber() < 0.25 then
		-- neon sign hanging off a face
		local sign = part({
			size = Vector3.new(1, rng:NextNumber(10, 22), 4),
			cf = CFrame.new(x + w / 2 + 1.2, rng:NextNumber(14, math.max(16, h * 0.5)), z),
			color = pick(NEON),
			material = Enum.Material.Neon,
			collide = false,
			name = "NeonSign",
		}, model)
		local light = Instance.new("PointLight")
		light.Color = sign.Color
		light.Range = 22
		light.Brightness = 1.2
		light.Parent = sign
	end
	return b
end

local function streetlight(pos: Vector3, parent: Instance)
	part({
		size = Vector3.new(0.6, 16, 0.6),
		cf = CFrame.new(pos + Vector3.new(0, 8, 0)),
		color = rgb(30, 30, 32),
		material = Enum.Material.Metal,
		name = "LampPost",
	}, parent)
	local bulb = part({
		size = Vector3.new(1.6, 1, 1.6),
		cf = CFrame.new(pos + Vector3.new(0, 16, 0)),
		color = rgb(255, 214, 150),
		material = Enum.Material.Neon,
		collide = false,
		name = "Lamp",
	}, parent)
	local light = Instance.new("PointLight")
	light.Color = rgb(255, 200, 140)
	light.Range = 36
	light.Brightness = 1.4
	light.Parent = bulb
	CollectionService:AddTag(bulb, "StreetLamp")
end

---------------------------------------------------------------- props

-- Props are unanchored physics objects the player can grab and throw.
-- Tier: 1 = any form can lift it, 2 = hybrid or beast, 3 = beast only.
local function prop(model: Model, tier: number, explosive: boolean?)
	model:SetAttribute("Tier", tier)
	if explosive then
		model:SetAttribute("Explosive", true)
	end
	CollectionService:AddTag(model, "Prop")
	local primary = model.PrimaryPart
	if primary then
		for _, d in model:GetDescendants() do
			if d:IsA("BasePart") and d ~= primary then
				local weld = Instance.new("WeldConstraint")
				weld.Part0 = primary
				weld.Part1 = d
				weld.Parent = primary
			end
		end
	end
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			d.Anchored = false
		end
	end
end

local CAR_COLORS = { rgb(140, 24, 24), rgb(30, 50, 110), rgb(200, 200, 200), rgb(24, 24, 26), rgb(180, 140, 40), rgb(40, 90, 60) }

local function car(cf: CFrame, parent: Instance, police: boolean?): Model
	local m = Instance.new("Model")
	m.Name = if police then "PoliceCar" else "Car"
	local color = if police then rgb(20, 22, 30) else pick(CAR_COLORS)
	local body = part({ size = Vector3.new(7, 2.6, 15), cf = cf * CFrame.new(0, 2.1, 0), color = color, material = Enum.Material.SmoothPlastic, name = "Body", anchored = false }, m)
	part({ size = Vector3.new(6.4, 2.4, 7.5), cf = cf * CFrame.new(0, 4.6, 0.5), color = rgb(30, 38, 48), material = Enum.Material.Glass, name = "Cabin", anchored = false }, m)
	for _, o in { Vector3.new(-3.4, 1.2, -4.8), Vector3.new(3.4, 1.2, -4.8), Vector3.new(-3.4, 1.2, 4.8), Vector3.new(3.4, 1.2, 4.8) } do
		part({ size = Vector3.new(1.2, 2.6, 2.6), cf = cf * CFrame.new(o) * CFrame.Angles(0, 0, math.pi / 2), color = rgb(15, 15, 15), material = Enum.Material.Rubber, shape = Enum.PartType.Cylinder, anchored = false }, m)
	end
	part({ size = Vector3.new(5.6, 0.6, 0.2), cf = cf * CFrame.new(0, 2.4, -7.55), color = rgb(255, 240, 200), material = Enum.Material.Neon, collide = false, anchored = false, name = "Headlights" }, m)
	part({ size = Vector3.new(5.6, 0.6, 0.2), cf = cf * CFrame.new(0, 2.4, 7.55), color = rgb(200, 20, 20), material = Enum.Material.Neon, collide = false, anchored = false }, m)
	if police then
		part({ size = Vector3.new(3, 0.6, 1), cf = cf * CFrame.new(-1.5, 6.1, 0.5), color = rgb(255, 30, 30), material = Enum.Material.Neon, collide = false, anchored = false, name = "SirenRed" }, m)
		part({ size = Vector3.new(3, 0.6, 1), cf = cf * CFrame.new(1.5, 6.1, 0.5), color = rgb(40, 80, 255), material = Enum.Material.Neon, collide = false, anchored = false, name = "SirenBlue" }, m)
		part({ size = Vector3.new(7.05, 1, 6), cf = cf * CFrame.new(0, 2.4, 0), color = rgb(230, 230, 230), material = Enum.Material.SmoothPlastic, collide = false, anchored = false }, m)
	end
	m.PrimaryPart = body
	m.Parent = parent
	prop(m, 3)
	body.CustomPhysicalProperties = PhysicalProperties.new(2, 0.5, 0.1)
	return m
end

local function smallProp(kind: string, pos: Vector3, parent: Instance)
	local m = Instance.new("Model")
	m.Name = kind
	local main: BasePart
	if kind == "Bench" then
		main = part({ size = Vector3.new(7, 0.6, 2.2), cf = CFrame.new(pos + Vector3.new(0, 2, 0)), color = rgb(90, 60, 36), material = Enum.Material.WoodPlanks, anchored = false }, m)
		part({ size = Vector3.new(7, 2, 0.4), cf = CFrame.new(pos + Vector3.new(0, 3.2, 1)), color = rgb(90, 60, 36), material = Enum.Material.WoodPlanks, anchored = false }, m)
		part({ size = Vector3.new(0.4, 2, 2), cf = CFrame.new(pos + Vector3.new(-3, 1, 0)), color = rgb(30, 30, 30), material = Enum.Material.Metal, anchored = false }, m)
		part({ size = Vector3.new(0.4, 2, 2), cf = CFrame.new(pos + Vector3.new(3, 1, 0)), color = rgb(30, 30, 30), material = Enum.Material.Metal, anchored = false }, m)
		m.PrimaryPart = main
		m.Parent = parent
		prop(m, 1)
	elseif kind == "Trash" then
		main = part({ size = Vector3.new(3.2, 4, 3.2), cf = CFrame.new(pos + Vector3.new(0, 2, 0)) * CFrame.Angles(0, 0, math.pi / 2), color = rgb(50, 70, 50), material = Enum.Material.Metal, shape = Enum.PartType.Cylinder, anchored = false }, m)
		m.PrimaryPart = main
		m.Parent = parent
		prop(m, 1)
	elseif kind == "Barrel" then
		main = part({ size = Vector3.new(4, 3.4, 3.4), cf = CFrame.new(pos + Vector3.new(0, 2, 0)) * CFrame.Angles(0, 0, math.pi / 2), color = rgb(190, 40, 20), material = Enum.Material.Metal, shape = Enum.PartType.Cylinder, anchored = false }, m)
		part({ size = Vector3.new(0.3, 3.5, 3.5), cf = CFrame.new(pos + Vector3.new(0, 3, 0)) * CFrame.Angles(0, 0, math.pi / 2), color = rgb(240, 200, 30), material = Enum.Material.Neon, shape = Enum.PartType.Cylinder, collide = false, anchored = false }, m)
		m.PrimaryPart = main
		m.Parent = parent
		prop(m, 1, true)
	elseif kind == "Dumpster" then
		main = part({ size = Vector3.new(9, 5, 5), cf = CFrame.new(pos + Vector3.new(0, 2.5, 0)), color = rgb(30, 70, 40), material = Enum.Material.Metal, anchored = false }, m)
		part({ size = Vector3.new(9.2, 0.5, 5.2), cf = CFrame.new(pos + Vector3.new(0, 5.2, 0)), color = rgb(20, 40, 25), material = Enum.Material.Metal, anchored = false }, m)
		m.PrimaryPart = main
		m.Parent = parent
		prop(m, 2)
	elseif kind == "Hydrant" then
		main = part({ size = Vector3.new(1.4, 3, 1.4), cf = CFrame.new(pos + Vector3.new(0, 1.5, 0)), color = rgb(200, 30, 30), material = Enum.Material.Metal, anchored = false }, m)
		part({ size = Vector3.new(2.4, 0.8, 0.8), cf = CFrame.new(pos + Vector3.new(0, 2.2, 0)), color = rgb(200, 30, 30), material = Enum.Material.Metal, anchored = false }, m)
		m.PrimaryPart = main
		m.Parent = parent
		prop(m, 1)
	end
end

---------------------------------------------------------------- the city

local function buildCity(roadPoints: { Vector3 }): { BasePart }
	local city = folder("City")
	local streets = folder("Streets", city)
	local props = folder("Props", city)
	local C = WorldLayout.CITY_HALF
	local B = WorldLayout.BLOCK
	local R = WorldLayout.ROAD
	local towers: { BasePart } = {}

	local roads: { number } = {}
	local v = -C
	while v <= C + 0.1 do
		table.insert(roads, v)
		v += B
	end

	-- lane markings
	for _, r in roads do
		for t = -C, C - 12, 24 do
			part({ size = Vector3.new(0.6, 0.1, 10), cf = CFrame.new(r, 0.05, t + 6), color = rgb(220, 190, 60), material = Enum.Material.Neon, collide = false, name = "Lane" }, streets)
			part({ size = Vector3.new(10, 0.1, 0.6), cf = CFrame.new(t + 6, 0.05, r), color = rgb(220, 190, 60), material = Enum.Material.Neon, collide = false, name = "Lane" }, streets)
		end
	end

	for i = 1, #roads - 1 do
		for j = 1, #roads - 1 do
			local x0, x1 = roads[i] + R / 2, roads[i + 1] - R / 2
			local z0, z1 = roads[j] + R / 2, roads[j + 1] - R / 2
			local cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
			local w, d = x1 - x0, z1 - z0
			local dist = math.sqrt(cx * cx + cz * cz)
			-- sidewalk slab
			part({ size = Vector3.new(w, 0.8, d), cf = CFrame.new(cx, 0.4, cz), color = rgb(105, 105, 110), material = Enum.Material.Concrete, name = "Sidewalk" }, streets)
			table.insert(roadPoints, Vector3.new(roads[i], 0, cz))
			table.insert(roadPoints, Vector3.new(cx, 0, roads[j]))

			local here = Vector3.new(cx, 0, cz)
			local openLot = (here - WorldLayout.LANDMARKS.safehouse).Magnitude < 45
			for _, n in WorldLayout.NESTS do
				if (here - n.pos).Magnitude < 50 then
					openLot = true -- nest lots stay open too
				end
			end
			if dist < WorldLayout.PLAZA + 30 then
				-- the plaza: open square with a fountain at the centre block corner
				part({ size = Vector3.new(w, 0.2, d), cf = CFrame.new(cx, 0.9, cz), color = rgb(132, 120, 104), material = Enum.Material.Cobblestone, name = "PlazaStone" }, streets)
				for _ = 1, 2 do
					smallProp("Bench", Vector3.new(cx + rng:NextNumber(-w / 3, w / 3), 0.8, cz + rng:NextNumber(-d / 3, d / 3)), props)
				end
			elseif not openLot then
				-- 1 to 4 towers per block, taller toward downtown
				local split = if dist < WorldLayout.DOWNTOWN then rng:NextInteger(1, 2) else rng:NextInteger(2, 3)
				local inset = 4
				local cell = (w - inset * 2) / split
				for a = 0, split - 1 do
					for b = 0, split - 1 do
						if rng:NextNumber() < 0.92 then
							local bw = cell - rng:NextNumber(2, 6)
							local bd = cell - rng:NextNumber(2, 6)
							local bx = x0 + inset + cell * (a + 0.5)
							local bz = z0 + inset + cell * (b + 0.5)
							local downtown = 1 - math.clamp(dist / (C * 1.2), 0, 1)
							local h = 24 + rng:NextNumber(0, 50) + downtown * downtown * rng:NextNumber(80, 260)
							table.insert(towers, building(bx, bz, bw, bd, h, city))
						end
					end
				end
			end
			-- street furniture around the block edge
			for _ = 1, 2 do
				local side = rng:NextInteger(1, 4)
				local t = rng:NextNumber(-0.4, 0.4)
				local pos = if side == 1
					then Vector3.new(cx + t * w, 0.8, z0 + 2)
					elseif side == 2 then Vector3.new(cx + t * w, 0.8, z1 - 2)
					elseif side == 3 then Vector3.new(x0 + 2, 0.8, cz + t * d)
					else Vector3.new(x1 - 2, 0.8, cz + t * d)
				smallProp(pick({ "Trash", "Hydrant", "Bench", "Barrel", "Dumpster" }), pos, props)
			end
			-- parked cars along one curb
			if rng:NextNumber() < 0.55 then
				local cxr = roads[i] + R / 2 - 4.5
				car(CFrame.new(cxr, 0, cz + rng:NextNumber(-d / 3, d / 3)), props)
			end
		end
	end

	-- streetlights at intersections (inner city only: lights are not free)
	for _, rx in roads do
		for _, rz in roads do
			if math.abs(rx) <= 336 and math.abs(rz) <= 336 then
				streetlight(Vector3.new(rx + R / 2 + 1.5, 0.8, rz + R / 2 + 1.5), streets)
			end
		end
	end

	-- the plaza fountain
	local plaza = folder("Plaza", city)
	part({ size = Vector3.new(3, 30, 30), cf = CFrame.new(0, 1.5, 0) * CFrame.Angles(0, 0, math.pi / 2), color = rgb(150, 140, 125), material = Enum.Material.Marble, shape = Enum.PartType.Cylinder, name = "FountainBasin" }, plaza)
	part({ size = Vector3.new(0.4, 26, 26), cf = CFrame.new(0, 3.1, 0) * CFrame.Angles(0, 0, math.pi / 2), color = rgb(60, 130, 170), material = Enum.Material.Glass, shape = Enum.PartType.Cylinder, collide = false, transparency = 0.25, name = "FountainWater" }, plaza)
	part({ size = Vector3.new(3, 14, 3), cf = CFrame.new(0, 8, 0), color = rgb(150, 140, 125), material = Enum.Material.Marble, name = "FountainPillar" }, plaza)
	local wolfStatue = part({ size = Vector3.new(4, 4, 7), cf = CFrame.new(0, 17, 0), color = rgb(70, 80, 70), material = Enum.Material.Granite, name = "WolfStatue" }, plaza)
	part({ size = Vector3.new(2.4, 3, 3), cf = wolfStatue.CFrame * CFrame.new(0, 2.6, -3.6) * CFrame.Angles(math.rad(-30), 0, 0), color = rgb(70, 80, 70), material = Enum.Material.Granite }, plaza)

	-- the safehouse: a small brick house on a quiet corner
	local S = WorldLayout.LANDMARKS.safehouse
	local safe = folder("Safehouse", city)
	part({ size = Vector3.new(30, 1, 26), cf = CFrame.new(S.X, 1, S.Z), color = rgb(80, 60, 44), material = Enum.Material.WoodPlanks, name = "Floor" }, safe)
	part({ size = Vector3.new(30, 14, 1), cf = CFrame.new(S.X, 8, S.Z - 13), color = rgb(110, 62, 48), material = Enum.Material.Brick }, safe)
	part({ size = Vector3.new(1, 14, 26), cf = CFrame.new(S.X - 15, 8, S.Z), color = rgb(110, 62, 48), material = Enum.Material.Brick }, safe)
	part({ size = Vector3.new(1, 14, 26), cf = CFrame.new(S.X + 15, 8, S.Z), color = rgb(110, 62, 48), material = Enum.Material.Brick }, safe)
	part({ size = Vector3.new(11, 14, 1), cf = CFrame.new(S.X - 9.5, 8, S.Z + 13), color = rgb(110, 62, 48), material = Enum.Material.Brick }, safe)
	part({ size = Vector3.new(11, 14, 1), cf = CFrame.new(S.X + 9.5, 8, S.Z + 13), color = rgb(110, 62, 48), material = Enum.Material.Brick }, safe)
	part({ size = Vector3.new(32, 1, 28), cf = CFrame.new(S.X, 15.5, S.Z), color = rgb(50, 40, 36), material = Enum.Material.Slate }, safe)
	local bed = part({ size = Vector3.new(6, 2, 9), cf = CFrame.new(S.X - 9, 2.5, S.Z - 6), color = rgb(120, 30, 34), material = Enum.Material.Fabric, name = "Bed" }, safe)
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Rest until the next dusk / dawn"
	prompt.ObjectText = "Safehouse"
	prompt.MaxActivationDistance = 12
	prompt.Parent = bed
	CollectionService:AddTag(bed, "SafehouseBed")
	local lamp = part({ size = Vector3.new(1, 1, 1), cf = CFrame.new(S.X, 13, S.Z), color = rgb(255, 210, 150), material = Enum.Material.Neon, collide = false }, safe)
	local l = Instance.new("PointLight")
	l.Range = 26
	l.Color = rgb(255, 200, 140)
	l.Parent = lamp

	return towers
end

---------------------------------------------------------------- nature

local function tree(pos: Vector3, parent: Instance)
	local h = rng:NextNumber(22, 46)
	local m = Instance.new("Model")
	m.Name = "Tree"
	local trunk = part({ size = Vector3.new(h, 2.2, 2.2), cf = CFrame.new(pos + Vector3.new(0, h / 2 - 1, 0)) * CFrame.Angles(0, 0, math.pi / 2), color = rgb(58, 42, 30), material = Enum.Material.Wood, shape = Enum.PartType.Cylinder, name = "Trunk" }, m)
	CollectionService:AddTag(trunk, "Climbable")
	local pine = rng:NextNumber() < 0.6
	if pine then
		for k = 0, 2 do
			local s = (3 - k) * rng:NextNumber(5, 7)
			part({ size = Vector3.new(s, s * 0.9, s), cf = CFrame.new(pos + Vector3.new(0, h * 0.45 + k * h * 0.2, 0)) * CFrame.Angles(0, rng:NextNumber(0, 6.28), 0), color = rgb(28, 56 + k * 6, 36), material = Enum.Material.Grass, shape = Enum.PartType.Ball, collide = false, name = "Needles" }, m)
		end
	else
		for _ = 1, 3 do
			local s = rng:NextNumber(12, 20)
			part({ size = Vector3.new(s, s, s), cf = CFrame.new(pos + Vector3.new(rng:NextNumber(-4, 4), h * 0.85 + rng:NextNumber(-3, 3), rng:NextNumber(-4, 4))), color = rgb(48 + rng:NextInteger(0, 20), 74 + rng:NextInteger(0, 20), 34), material = Enum.Material.Grass, shape = Enum.PartType.Ball, collide = false, name = "Leaves" }, m)
		end
	end
	m.Parent = parent
end

local function rock(pos: Vector3, parent: Instance)
	local s = rng:NextNumber(4, 14)
	part({ size = Vector3.new(s, s * 0.7, s * 1.2), cf = CFrame.new(pos + Vector3.new(0, s * 0.2, 0)) * CFrame.Angles(rng:NextNumber(0, 1), rng:NextNumber(0, 6), rng:NextNumber(0, 1)), color = rgb(90, 90, 92), material = Enum.Material.Rock, name = "Rock" }, parent)
end

local function buildNature(forestPoints: { Vector3 })
	local nature = folder("Nature")
	local H = WorldLayout.HALF - 30
	local placed = 0
	local tries = 0
	while placed < 1100 and tries < 6000 do
		tries += 1
		local x = rng:NextNumber(-H, H)
		local z = rng:NextNumber(WorldLayout.MOUNTAIN_Z - 60, H)
		if not WorldLayout.inCity(x, z) and not WorldLayout.inLake(x, z, 40) and not nearLandmark(x, z, 70) then
			local y = groundY(x, z)
			if y > WorldLayout.WATER_LEVEL + 1 then
				tree(Vector3.new(x, y, z), nature)
				placed += 1
				if placed % 12 == 0 then
					table.insert(forestPoints, Vector3.new(x + 8, y, z + 8))
				end
			end
		end
	end
	for _ = 1, 220 do
		local x = rng:NextNumber(-H, H)
		local z = rng:NextNumber(-H, H)
		if not WorldLayout.inCity(x, z) and not WorldLayout.inLake(x, z, 10) then
			rock(Vector3.new(x, groundY(x, z), z), nature)
		end
	end
end

---------------------------------------------------------------- landmarks

local function buildCathedral(parent: Instance): BasePart
	local P = WorldLayout.LANDMARKS.cathedral
	local y = groundY(P.X, P.Z)
	local stone = rgb(96, 92, 100)
	local m = folder("Cathedral", parent)
	part({ size = Vector3.new(60, 2, 120), cf = CFrame.new(P.X, y + 1, P.Z), color = rgb(70, 68, 72), material = Enum.Material.Cobblestone }, m)
	local nave = part({ size = Vector3.new(44, 60, 96), cf = CFrame.new(P.X, y + 32, P.Z), color = stone, material = Enum.Material.Slate, name = "Nave" }, m)
	CollectionService:AddTag(nave, "Climbable")
	part({ size = Vector3.new(44, 26, 48), cf = CFrame.new(P.X, y + 75, P.Z - 24), color = rgb(50, 46, 56), material = Enum.Material.Slate, class = "WedgePart" }, m)
	part({ size = Vector3.new(44, 26, 48), cf = CFrame.new(P.X, y + 75, P.Z + 24) * CFrame.Angles(0, math.pi, 0), color = rgb(50, 46, 56), material = Enum.Material.Slate, class = "WedgePart" }, m)
	-- stained glass
	for i = -3, 3 do
		for _, sx in { -22.3, 22.3 } do
			part({ size = Vector3.new(0.4, 22, 7), cf = CFrame.new(P.X + sx, y + 32, P.Z + i * 12), color = pick({ rgb(200, 40, 60), rgb(60, 80, 220), rgb(220, 170, 50), rgb(120, 40, 180) }), material = Enum.Material.Neon, collide = false, transparency = 0.2, name = "StainedGlass" }, m)
		end
	end
	-- twin bell towers and the central spire
	for _, sx in { -16, 16 } do
		local t = part({ size = Vector3.new(14, 110, 14), cf = CFrame.new(P.X + sx, y + 56, P.Z + 54), color = stone, material = Enum.Material.Slate, name = "BellTower" }, m)
		CollectionService:AddTag(t, "Climbable")
		part({ size = Vector3.new(14, 30, 14), cf = CFrame.new(P.X + sx, y + 126, P.Z + 54) * CFrame.Angles(0, math.rad(45), 0), color = rgb(40, 36, 46), material = Enum.Material.Slate, class = "CornerWedgePart" }, m)
	end
	local spire = part({ size = Vector3.new(8, 70, 8), cf = CFrame.new(P.X, y + 122, P.Z - 10), color = stone, material = Enum.Material.Slate, name = "Spire" }, m)
	CollectionService:AddTag(spire, "Climbable")
	return spire
end

local function buildCemetery(parent: Instance)
	local P = WorldLayout.LANDMARKS.cemetery
	local m = folder("Cemetery", parent)
	for gx = -5, 5 do
		for gz = -4, 4 do
			if rng:NextNumber() < 0.75 then
				local x, z = P.X + gx * 12 + rng:NextNumber(-2, 2), P.Z + gz * 12 + rng:NextNumber(-2, 2)
				local y = groundY(x, z)
				local tall = rng:NextNumber() < 0.2
				part({
					size = if tall then Vector3.new(2, 9, 2) else Vector3.new(3.4, 4.2, 0.9),
					cf = CFrame.new(x, y + (if tall then 4.5 else 2), z) * CFrame.Angles(rng:NextNumber(-0.12, 0.12), rng:NextNumber(-0.2, 0.2), rng:NextNumber(-0.12, 0.12)),
					color = rgb(110, 110, 112),
					material = Enum.Material.Granite,
					name = "Grave",
				}, m)
			end
		end
	end
	-- mausoleum
	local y = groundY(P.X, P.Z - 70)
	part({ size = Vector3.new(26, 20, 22), cf = CFrame.new(P.X, y + 10, P.Z - 70), color = rgb(120, 118, 112), material = Enum.Material.Marble, name = "Mausoleum" }, m)
	part({ size = Vector3.new(30, 10, 26), cf = CFrame.new(P.X, y + 25, P.Z - 70), color = rgb(90, 88, 84), material = Enum.Material.Marble, class = "WedgePart" }, m)
	local glow = part({ size = Vector3.new(8, 12, 0.5), cf = CFrame.new(P.X, y + 6, P.Z - 58.8), color = rgb(90, 255, 140), material = Enum.Material.Neon, collide = false, name = "TombGlow" }, m)
	local light = Instance.new("PointLight")
	light.Color = glow.Color
	light.Range = 40
	light.Parent = glow
	-- iron fence
	for i = -36, 36, 3 do
		for _, side in { -60, 60 } do
			part({ size = Vector3.new(0.4, 6, 0.4), cf = CFrame.new(P.X + i * 2, groundY(P.X + i * 2, P.Z + side) + 3, P.Z + side), color = rgb(20, 20, 22), material = Enum.Material.Metal, name = "Fence" }, m)
		end
	end
end

local function buildRuins(parent: Instance)
	local P = WorldLayout.LANDMARKS.ruins
	local m = folder("Ruins", parent)
	local stone = rgb(120, 112, 96)
	for i = 0, 15 do
		local a = i / 16 * math.pi * 2
		local x, z = P.X + math.cos(a) * 70, P.Z + math.sin(a) * 70
		local y = groundY(x, z)
		local h = rng:NextNumber(10, 46)
		local pillar = part({ size = Vector3.new(6, h, 6), cf = CFrame.new(x, y + h / 2, z) * CFrame.Angles(rng:NextNumber(-0.08, 0.08), a, rng:NextNumber(-0.08, 0.08)), color = stone, material = Enum.Material.Sandstone, name = "Pillar" }, m)
		CollectionService:AddTag(pillar, "Climbable")
		if i % 2 == 0 and h > 30 then
			local b = a + math.pi / 8
			part({ size = Vector3.new(6, 4, 30), cf = CFrame.new(P.X + math.cos(b) * 70, y + h + 2, P.Z + math.sin(b) * 70) * CFrame.Angles(0, -b, 0), color = stone, material = Enum.Material.Sandstone, name = "Lintel" }, m)
		end
	end
	local y = groundY(P.X, P.Z)
	part({ size = Vector3.new(40, 3, 40), cf = CFrame.new(P.X, y + 1.5, P.Z), color = rgb(100, 96, 86), material = Enum.Material.Sandstone, name = "Altar" }, m)
	local shrine = part({ size = Vector3.new(4, 8, 4), cf = CFrame.new(P.X, y + 7, P.Z), color = rgb(180, 220, 255), material = Enum.Material.Neon, name = "MoonShrine" }, m)
	local light = Instance.new("PointLight")
	light.Color = shrine.Color
	light.Range = 50
	light.Brightness = 2
	light.Parent = shrine
	CollectionService:AddTag(shrine, "MoonShrine")
end

local function buildLodge(parent: Instance): BasePart
	local P = WorldLayout.LANDMARKS.lodge
	local m = folder("HuntersLodge", parent)
	local y = groundY(P.X, P.Z)
	local wood = rgb(92, 62, 38)
	part({ size = Vector3.new(50, 18, 34), cf = CFrame.new(P.X, y + 9, P.Z), color = wood, material = Enum.Material.WoodPlanks, name = "Lodge" }, m)
	part({ size = Vector3.new(54, 12, 19), cf = CFrame.new(P.X, y + 24, P.Z - 8.5), color = rgb(60, 40, 30), material = Enum.Material.WoodPlanks, class = "WedgePart" }, m)
	part({ size = Vector3.new(54, 12, 19), cf = CFrame.new(P.X, y + 24, P.Z + 8.5) * CFrame.Angles(0, math.pi, 0), color = rgb(60, 40, 30), material = Enum.Material.WoodPlanks, class = "WedgePart" }, m)
	local fire = part({ size = Vector3.new(3, 1, 3), cf = CFrame.new(P.X, y + 0.5, P.Z + 30), color = rgb(255, 120, 30), material = Enum.Material.Neon, name = "Campfire" }, m)
	local f = Instance.new("Fire")
	f.Size = 6
	f.Parent = fire
	local light = Instance.new("PointLight")
	light.Color = rgb(255, 140, 60)
	light.Range = 40
	light.Brightness = 2
	light.Parent = fire
	-- watchtower
	local tx, tz = P.X + 40, P.Z - 30
	local ty = groundY(tx, tz)
	for _, o in { Vector3.new(-4, 0, -4), Vector3.new(4, 0, -4), Vector3.new(-4, 0, 4), Vector3.new(4, 0, 4) } do
		local leg = part({ size = Vector3.new(1.4, 70, 1.4), cf = CFrame.new(tx + o.X, ty + 35, tz + o.Z), color = wood, material = Enum.Material.Wood, name = "TowerLeg" }, m)
		CollectionService:AddTag(leg, "Climbable")
	end
	local deck = part({ size = Vector3.new(14, 1, 14), cf = CFrame.new(tx, ty + 70, tz), color = wood, material = Enum.Material.WoodPlanks, name = "TowerDeck" }, m)
	return deck
end

local function buildDen(parent: Instance)
	local P = WorldLayout.LANDMARKS.den
	local m = folder("AlphaDen", parent)
	Terrain:FillBall(Vector3.new(P.X - 40, -20, P.Z - 50), 80, Enum.Material.Rock)
	Terrain:FillBall(Vector3.new(P.X + 60, -30, P.Z - 30), 70, Enum.Material.Rock)
	for _ = 1, 40 do
		local x, z = P.X + rng:NextNumber(-50, 50), P.Z + rng:NextNumber(-30, 50)
		local y = groundY(x, z)
		part({ size = Vector3.new(0.6, 0.6, rng:NextNumber(2, 5)), cf = CFrame.new(x, y + 0.3, z) * CFrame.Angles(0, rng:NextNumber(0, 6), 0), color = rgb(225, 220, 200), material = Enum.Material.SmoothPlastic, name = "Bone" }, m)
	end
	for i = 0, 7 do
		local a = i / 8 * math.pi * 2
		local x, z = P.X + math.cos(a) * 46, P.Z + math.sin(a) * 46
		local y = groundY(x, z)
		local torch = part({ size = Vector3.new(1, 8, 1), cf = CFrame.new(x, y + 4, z), color = rgb(60, 40, 30), material = Enum.Material.Wood }, m)
		local fire = Instance.new("Fire")
		fire.Color = rgb(255, 90, 40)
		fire.Size = 3
		fire.Parent = torch
	end
end

---------------------------------------------------------------- collectibles

local function moonstone(id: string, pos: Vector3, parent: Instance): BasePart
	local stone = part({ size = Vector3.new(1.8, 3.2, 1.8), cf = CFrame.new(pos + Vector3.new(0, 2.4, 0)) * CFrame.Angles(0, rng:NextNumber(0, 6), math.rad(15)), color = rgb(150, 210, 255), material = Enum.Material.Neon, collide = false, name = id }, parent)
	local light = Instance.new("PointLight")
	light.Color = stone.Color
	light.Range = 14
	light.Brightness = 1.5
	light.Parent = stone
	local sparkle = Instance.new("Sparkles")
	sparkle.SparkleColor = stone.Color
	sparkle.Parent = stone
	CollectionService:AddTag(stone, "Moonstone")
	return stone
end

local function vantage(id: string, label: string, pos: Vector3, parent: Instance): BasePart
	local v = part({ size = Vector3.new(4, 0.6, 4), cf = CFrame.new(pos + Vector3.new(0, 0.3, 0)), color = rgb(255, 230, 160), material = Enum.Material.Neon, name = id }, parent)
	v:SetAttribute("Label", label)
	local beam = part({ size = Vector3.new(1, 60, 1), cf = CFrame.new(pos + Vector3.new(0, 30, 0)), color = rgb(255, 230, 160), material = Enum.Material.Neon, collide = false, transparency = 0.6, name = "VantageBeam" }, parent)
	beam.CastShadow = false
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Survey"
	prompt.ObjectText = label
	prompt.MaxActivationDistance = 14
	prompt.RequiresLineOfSight = false
	prompt.Parent = v
	CollectionService:AddTag(v, "Vantage")
	return v
end

local function nest(id: string, name: string, pos: Vector3, parent: Instance): Model
	local m = Instance.new("Model")
	m.Name = id
	local y = groundY(pos.X, pos.Z)
	local core = part({ size = Vector3.new(8, 14, 8), cf = CFrame.new(pos.X, y + 7, pos.Z), color = rgb(120, 10, 30), material = Enum.Material.Neon, name = "Heart" }, m)
	for i = 0, 5 do
		local a = i / 6 * math.pi * 2
		part({ size = Vector3.new(3, rng:NextNumber(10, 20), 3), cf = CFrame.new(pos.X + math.cos(a) * 7, y + 6, pos.Z + math.sin(a) * 7) * CFrame.Angles(math.cos(a) * 0.4, 0, math.sin(a) * 0.4), color = rgb(40, 8, 16), material = Enum.Material.Basalt, name = "Thorn" }, m)
	end
	local light = Instance.new("PointLight")
	light.Color = rgb(255, 30, 60)
	light.Range = 50
	light.Brightness = 2
	light.Parent = core
	m.PrimaryPart = core
	m:SetAttribute("District", name)
	m:SetAttribute("MaxHealth", 600)
	m:SetAttribute("Health", 600)
	CollectionService:AddTag(m, "Nest")
	m.Parent = parent
	return m
end

---------------------------------------------------------------- atmosphere

local function buildAtmosphere()
	local atmo = Lighting:FindFirstChildOfClass("Atmosphere") or Instance.new("Atmosphere")
	atmo.Density = 0.36
	atmo.Offset = 0.1
	atmo.Color = rgb(150, 160, 190)
	atmo.Decay = rgb(70, 60, 90)
	atmo.Glare = 0.3
	atmo.Haze = 1.6
	atmo.Parent = Lighting
	local sky = Lighting:FindFirstChildOfClass("Sky") or Instance.new("Sky")
	sky.MoonAngularSize = 14
	sky.SunAngularSize = 12
	sky.StarCount = 4000
	sky.Parent = Lighting
	local bloom = Lighting:FindFirstChildOfClass("BloomEffect") or Instance.new("BloomEffect")
	bloom.Intensity = 0.8
	bloom.Size = 30
	bloom.Threshold = 1.4
	bloom.Parent = Lighting
	local cc = Instance.new("ColorCorrectionEffect")
	cc.Name = "MoonGrade"
	cc.Saturation = -0.08
	cc.Contrast = 0.08
	cc.Parent = Lighting
	local sun = Instance.new("SunRaysEffect")
	sun.Intensity = 0.06
	sun.Parent = Lighting
end

---------------------------------------------------------------- build

function WorldGen.build(): Built
	root = Instance.new("Folder")
	root.Name = "Greyhaven"
	root.Parent = workspace

	buildTerrain()
	buildAtmosphere()

	local roadPoints: { Vector3 } = {}
	local forestPoints: { Vector3 } = {}
	local towers = buildCity(roadPoints)
	buildNature(forestPoints)

	local landmarks = folder("Landmarks")
	local spire = buildCathedral(landmarks)
	buildCemetery(landmarks)
	buildRuins(landmarks)
	local towerDeck = buildLodge(landmarks)
	buildDen(landmarks)

	-- vantages: the five tallest towers, the cathedral spire, the lodge
	-- watchtower and the summit of the Ashen Peaks
	local vfolder = folder("Vantages")
	local vantages: { BasePart } = {}
	table.sort(towers, function(a, b)
		return a.Size.Y > b.Size.Y
	end)
	local NAMES = { "Ironspire", "Meridian Tower", "The Needle", "Halvard Building", "Crown Exchange" }
	for i = 1, math.min(5, #towers) do
		local t = towers[i]
		table.insert(vantages, vantage("vantage_" .. i, NAMES[i], t.Position + Vector3.new(0, t.Size.Y / 2 + 1.5, 0), vfolder))
	end
	table.insert(vantages, vantage("vantage_cathedral", "Cathedral Spire", spire.Position + Vector3.new(0, spire.Size.Y / 2, 0), vfolder))
	table.insert(vantages, vantage("vantage_lodge", "Lodge Watchtower", towerDeck.Position + Vector3.new(0, 0.5, 0), vfolder))
	local S = WorldLayout.LANDMARKS.summit
	table.insert(vantages, vantage("vantage_summit", "Ashen Summit", Vector3.new(S.X, groundY(S.X, S.Z), S.Z), vfolder))

	-- moonstones: half on rooftops, half in the wilds
	local mfolder = folder("Moonstones")
	local moonstones: { BasePart } = {}
	for i = 1, 20 do
		local t = towers[rng:NextInteger(math.min(#towers, 6), #towers)]
		table.insert(moonstones, moonstone("moonstone_" .. i, t.Position + Vector3.new(0, t.Size.Y / 2 + 1.4, 0), mfolder))
	end
	for i = 21, 40 do
		if #forestPoints == 0 then
			break
		end
		local p = forestPoints[rng:NextInteger(1, #forestPoints)]
		table.insert(moonstones, moonstone("moonstone_" .. i, p, mfolder))
	end

	local nfolder = folder("Nests")
	local nests: { [string]: Model } = {}
	for _, n in WorldLayout.NESTS do
		nests[n.id] = nest(n.id, n.name, n.pos, nfolder)
	end

	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "SafehouseSpawn"
	spawn.Anchored = true
	spawn.Size = Vector3.new(8, 1, 8)
	spawn.Transparency = 1
	spawn.CanCollide = false
	spawn.Neutral = true
	spawn.Duration = 0
	local SH = WorldLayout.LANDMARKS.safehouse
	spawn.CFrame = CFrame.new(SH.X, 2, SH.Z + 22)
	spawn.Parent = root

	return {
		moonstones = moonstones,
		vantages = vantages,
		nests = nests,
		spawn = spawn,
		roadPoints = roadPoints,
		forestPoints = forestPoints,
	}
end

WorldGen.groundY = groundY

return WorldGen
