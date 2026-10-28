--!strict
-- Tiny server-only signal bus so systems can react to each other without
-- requiring each other (keeps the dependency graph acyclic).

export type Connection = { Disconnect: (self: Connection) -> () }

type Signal = {
	listeners: { (...any) -> () },
}

local signals: { [string]: Signal } = {}

local Bus = {}

local function get(name: string): Signal
	local s = signals[name]
	if not s then
		s = { listeners = {} }
		signals[name] = s
	end
	return s
end

function Bus.on(name: string, fn: (...any) -> ()): Connection
	local s = get(name)
	table.insert(s.listeners, fn)
	local conn = {}
	function conn.Disconnect(_self: Connection)
		local i = table.find(s.listeners, fn)
		if i then
			table.remove(s.listeners, i)
		end
	end
	return (conn :: any) :: Connection
end

function Bus.emit(name: string, ...: any)
	local s = signals[name]
	if not s then
		return
	end
	for _, fn in table.clone(s.listeners) do
		task.spawn(fn, ...)
	end
end

return Bus
