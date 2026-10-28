--!strict
-- Client-local shared state between controllers (no networking here).

local ClientState = {
	sprinting = false,
	menuOpen = false,
	diving = false,
	climbing = false,
	wallRunSide = 0, -- -1 left, 1 right, 0 none
	flow = 0, -- 0..1 traversal flow meter
	sensesOn = false,
	trauma = 0, -- camera shake 0..1
	fovKick = 0,
	attackLockUntil = 0,
}

-- Add camera shake (decays in the camera controller).
function ClientState.shake(amount: number)
	ClientState.trauma = math.clamp(ClientState.trauma + amount, 0, 1)
end

function ClientState.kick(amount: number)
	ClientState.fovKick = math.max(ClientState.fovKick, amount)
end

function ClientState.addFlow(amount: number)
	ClientState.flow = math.clamp(ClientState.flow + amount, 0, 1)
end

return ClientState
