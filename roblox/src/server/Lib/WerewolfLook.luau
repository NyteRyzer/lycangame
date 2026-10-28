--!strict
-- Turns a player's own avatar into the hybrid (half human, half wolf) or the
-- full beast and back: rescales the body with HumanoidDescription, recolours
-- skin to fur, strips the shirt (beast also loses the trousers), hides hair
-- and face, then welds on a wolf head (snout, jaw, fangs, ears, glowing eyes),
-- a fur ruff, claws and a tail. The beast also hunches forward.

local Types = require(game:GetService("ReplicatedStorage"):WaitForChild("Shared").Types)

type FormKey = Types.FormKey

local WerewolfLook = {}

local FUR = {
	hybrid = { main = Color3.fromRGB(96, 74, 56), dark = Color3.fromRGB(52, 40, 30), skin = Color3.fromRGB(122, 94, 72) },
	wolf = { main = Color3.fromRGB(70, 56, 46), dark = Color3.fromRGB(34, 28, 24), skin = Color3.fromRGB(70, 56, 46) },
}

local SCALE = {
	hybrid = { height = 1.22, width = 1.15, depth = 1.12, head = 1.05 },
	wolf = { height = 1.45, width = 1.4, depth = 1.35, head = 1.15 },
}

local HUNCH = {
	hybrid = math.rad(10),
	wolf = math.rad(24),
}

local function weldPart(props: {
	size: Vector3,
	to: BasePart,
	offset: CFrame,
	color: Color3,
	material: Enum.Material?,
	shape: Enum.PartType?,
	wedge: boolean?,
	name: string?,
}, parent: Instance): BasePart
	local p: BasePart
	if props.wedge then
		p = Instance.new("WedgePart")
	else
		local pt = Instance.new("Part")
		if props.shape then
			pt.Shape = props.shape
		end
		p = pt
	end
	p.Name = props.name or "Fur"
	p.Size = props.size
	p.Color = props.color
	p.Material = props.material or Enum.Material.Fabric
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Massless = true
	p.Anchored = false
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.CFrame = props.to.CFrame * props.offset
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = props.to
	weld.Part1 = p
	weld.Parent = p
	p.Parent = parent
	return p
end

local function find(character: Model, ...: string): BasePart?
	for _, name in { ... } do
		local p = character:FindFirstChild(name)
		if p and p:IsA("BasePart") then
			return p
		end
	end
	return nil
end

local function setHunch(character: Model, angle: number)
	local upper = character:FindFirstChild("UpperTorso")
	local waist = upper and upper:FindFirstChild("Waist")
	if not waist or not waist:IsA("Motor6D") then
		return
	end
	local applied = waist:GetAttribute("LycanHunch")
	local current = if typeof(applied) == "number" then applied else 0
	if math.abs(current - angle) < 1e-4 then
		return
	end
	waist.C0 = waist.C0 * CFrame.Angles(current - angle, 0, 0)
	waist:SetAttribute("LycanHunch", angle)
	-- keep the eyes level: tilt the neck back by most of the hunch
	local head = character:FindFirstChild("Head")
	local neck = head and head:FindFirstChild("Neck")
	if neck and neck:IsA("Motor6D") then
		neck.C0 = neck.C0 * CFrame.Angles((angle - current) * 0.8, 0, 0)
	end
end

local function setHumanBitsVisible(character: Model, visible: boolean)
	for _, d in character:GetChildren() do
		if d:IsA("Accessory") then
			local handle = d:FindFirstChild("Handle")
			if handle and handle:IsA("BasePart") then
				handle.LocalTransparencyModifier = 0
				handle.Transparency = if visible then 0 else 1
			end
		end
	end
	local head = character:FindFirstChild("Head")
	local face = head and head:FindFirstChild("face")
	if face and face:IsA("Decal") then
		face.Transparency = if visible then 0 else 1
	end
end

local function buildWolfParts(character: Model, form: FormKey)
	local fur = FUR[form]
	local folder = Instance.new("Folder")
	folder.Name = "LycanParts"
	folder.Parent = character

	local head = find(character, "Head")
	if head then
		local s = head.Size.Y
		local big = if form == "wolf" then 1.25 else 1
		-- the head itself becomes furred
		head.Color = fur.main
		-- muzzle, nose, jaw
		weldPart({ to = head, size = Vector3.new(0.62, 0.48, 0.95) * s * big, offset = CFrame.new(0, -0.12 * s, -0.75 * s * big), color = fur.main, name = "Snout" }, folder)
		weldPart({ to = head, size = Vector3.new(0.28, 0.2, 0.2) * s * big, offset = CFrame.new(0, 0.02 * s, -1.22 * s * big), color = Color3.fromRGB(18, 14, 12), material = Enum.Material.SmoothPlastic, name = "Nose" }, folder)
		weldPart({ to = head, size = Vector3.new(0.5, 0.18, 0.8) * s * big, offset = CFrame.new(0, -0.42 * s, -0.68 * s * big) * CFrame.Angles(math.rad(8), 0, 0), color = fur.dark, name = "Jaw" }, folder)
		for _, side in { -1, 1 } do
			-- fangs
			weldPart({ to = head, size = Vector3.new(0.07, 0.2, 0.07) * s * big, offset = CFrame.new(side * 0.2 * s, -0.36 * s, -1.05 * s * big), color = Color3.fromRGB(240, 235, 215), material = Enum.Material.SmoothPlastic, name = "Fang" }, folder)
			-- pointed ears
			weldPart({ to = head, wedge = true, size = Vector3.new(0.14, 0.55, 0.32) * s * big, offset = CFrame.new(side * 0.32 * s, 0.68 * s, 0.05 * s) * CFrame.Angles(0, math.pi, side * math.rad(12)), color = fur.dark, name = "Ear" }, folder)
			-- glowing eyes
			local eye = weldPart({ to = head, size = Vector3.new(0.17, 0.09, 0.05) * s, offset = CFrame.new(side * 0.21 * s, 0.12 * s, -0.56 * s) * CFrame.Angles(0, 0, side * math.rad(-12)), color = if form == "wolf" then Color3.fromRGB(255, 170, 30) else Color3.fromRGB(255, 200, 60), material = Enum.Material.Neon, name = "Eye" }, folder)
			eye.CastShadow = false
		end
		-- mane over the skull and down the nape
		weldPart({ to = head, size = Vector3.new(1.05, 0.5, 1.1) * s, offset = CFrame.new(0, 0.38 * s, 0.12 * s), color = fur.dark, shape = Enum.PartType.Ball, name = "Mane" }, folder)
		local glow = Instance.new("PointLight")
		glow.Color = Color3.fromRGB(255, 170, 60)
		glow.Range = 8
		glow.Brightness = 0.6
		glow.Parent = head
		glow.Name = "LycanEyeGlow"
	end

	local torso = find(character, "UpperTorso", "Torso")
	if torso then
		local w = torso.Size.X
		-- thick ruff over the shoulders and chest
		for i = -2, 2 do
			weldPart({ to = torso, size = Vector3.new(0.55, 0.5, 0.65) * w, offset = CFrame.new(i * 0.2 * w, torso.Size.Y * 0.42, -0.05 * w), color = if i % 2 == 0 then fur.main else fur.dark, shape = Enum.PartType.Ball, name = "Ruff" }, folder)
		end
		weldPart({ to = torso, size = Vector3.new(0.8 * w, torso.Size.Y * 0.7, 0.25 * w), offset = CFrame.new(0, 0.05 * torso.Size.Y, 0.32 * torso.Size.Z), color = fur.dark, name = "BackFur" }, folder)
		if form == "wolf" then
			-- ridge of spines down the back
			for i = 0, 3 do
				weldPart({ to = torso, wedge = true, size = Vector3.new(0.08, 0.35, 0.4) * w, offset = CFrame.new(0, torso.Size.Y * (0.35 - i * 0.22), torso.Size.Z * 0.55) * CFrame.Angles(math.rad(-20), math.pi, 0), color = fur.dark, name = "Spine" }, folder)
			end
		end
	end

	local lower = find(character, "LowerTorso", "Torso")
	if lower then
		-- tail: tapered segments curving down and back
		local prev = lower
		local seg = lower.Size.X * (if form == "wolf" then 0.32 else 0.24)
		local cf = lower.CFrame * CFrame.new(0, 0, lower.Size.Z * 0.55) * CFrame.Angles(math.rad(-35), 0, 0)
		for i = 0, 4 do
			local size = seg * (1 - i * 0.12)
			cf = cf * CFrame.new(0, 0, size * 0.9) * CFrame.Angles(math.rad(10), 0, 0)
			local p = weldPart({ to = prev, size = Vector3.new(size, size, size * 1.5), offset = prev.CFrame:ToObjectSpace(cf), color = if i == 4 then fur.dark else fur.main, shape = Enum.PartType.Ball, name = "Tail" }, folder)
			prev = p
		end
	end

	for _, handName in { "LeftHand", "RightHand", "Left Arm", "Right Arm" } do
		local hand = find(character, handName)
		if hand then
			hand.Color = fur.dark
			local s = hand.Size.X
			local bottom = if handName:find("Arm") then -hand.Size.Y / 2 else -hand.Size.Y * 0.4
			for i = -1, 1 do
				local claw = weldPart({ to = hand, wedge = true, size = Vector3.new(0.12 * s, 0.7 * s, 0.24 * s), offset = CFrame.new(i * 0.3 * s, bottom - 0.3 * s, -0.25 * s) * CFrame.Angles(math.rad(180), 0, 0), color = Color3.fromRGB(230, 225, 205), material = Enum.Material.SmoothPlastic, name = "Claw" }, folder)
				claw.CastShadow = false
			end
		end
	end
	for _, footName in { "LeftFoot", "RightFoot" } do
		local foot = find(character, footName)
		if foot and form == "wolf" then
			foot.Color = fur.dark
			weldPart({ to = foot, size = Vector3.new(foot.Size.X * 1.1, foot.Size.Y * 0.8, foot.Size.Z * 1.5), offset = CFrame.new(0, 0, -foot.Size.Z * 0.3), color = fur.dark, name = "Paw" }, folder)
		end
	end
end

-- Apply `form` to the character. `original` is the description the player
-- spawned with; human form restores it exactly. Yields (ApplyDescription).
function WerewolfLook.apply(character: Model, form: FormKey, original: HumanoidDescription?)
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not humanoid then
		return
	end
	local old = character:FindFirstChild("LycanParts")
	if old then
		old:Destroy()
	end
	local head = character:FindFirstChild("Head")
	local glow = head and head:FindFirstChild("LycanEyeGlow")
	if glow then
		glow:Destroy()
	end
	setHunch(character, 0)

	local r15 = humanoid.RigType == Enum.HumanoidRigType.R15
	if original then
		local desc = original:Clone()
		if form ~= "human" then
			local s = SCALE[form]
			local fur = FUR[form]
			desc.HeightScale = original.HeightScale * s.height
			desc.WidthScale = original.WidthScale * s.width
			desc.DepthScale = original.DepthScale * s.depth
			desc.HeadScale = original.HeadScale * s.head
			desc.HeadColor = fur.main
			desc.TorsoColor = fur.main
			desc.LeftArmColor = fur.skin
			desc.RightArmColor = fur.skin
			desc.LeftLegColor = fur.main
			desc.RightLegColor = fur.main
			desc.Shirt = 0
			desc.GraphicTShirt = 0
			if form == "wolf" then
				desc.Pants = 0
			end
		end
		local ok, err = pcall(function()
			humanoid:ApplyDescription(desc)
		end)
		if not ok then
			warn("[WerewolfLook] ApplyDescription failed: " .. tostring(err))
		end
	end
	if not character.Parent then
		return
	end
	if not r15 then
		-- R6 avatars cannot be rescaled through the description
		pcall(function()
			character:ScaleTo(if form == "human" then 1 elseif form == "hybrid" then 1.2 else 1.4)
		end)
	end

	setHumanBitsVisible(character, form == "human")
	if form ~= "human" then
		buildWolfParts(character, form)
		setHunch(character, HUNCH[form])
	end
end

return WerewolfLook
