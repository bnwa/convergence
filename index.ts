let id = -1
function Id() { return ++id }

let stackFrame = -1
const stackFrames: Array<number> = []

type SignalBuilder = {
  new<T>(x: T) : Signal<T>
}

const ents: Map<number,Signal<unknown>|Computed<unknown>> = new Map

function evaluate(ids: Array<number>, num: number) {
  for (let i = 0, id: number,  c: Computed<unknown>; i < num; i++) {
    id = ids[i]
    if (!ents.has(id)) throw new Error('Missing computation ${id}!')
    c = ents.get(id) as Computed<unknown>
    c.put()
  }
}

class Signal<T> {
  private readonly id = Id()
  private deps: Array<number> = []
  private depsNum = 0
  constructor(private x: T) {}

  get() : T {
    console.log(`Pulled ${this.id}`)
    if (stackFrame !== -1) {
      this.depsNum = this.deps.push(stackFrame)
    }
    return this.x
  }

  put(x: T) : Signal<T> {
    const deps = this.deps
    this.x = x
    for (let end = deps.length, i = 0; i < end; i++) {
    }
    return this
  }

  static of<T>(x: T) { return new Signal(x) }
}

class Computed<T> {
  private memo: unknown
  private readonly id = Id()
  private dependencies: Array<number> = []
  constructor(private readonly fn: () => T) {}
  get() :T {
    const currFrame = stackFrame
    if (currFrame !== -1) this.dependencies.push(currFrame)
    stackFrame = this.id
    const value = this.memo = this.fn()
    stackFrame = currFrame
    console.log(`Pulled ${this.id}`)
    return value
  }
  put() {
    this.memo = this.fn()
  }

  static of<T>(fn: () => T) : Computed<T> { return new Computed(fn) }
}

const s1 = Signal.of(5)
const s2 = Signal.of(5)
const sum = Computed.of(() => s1.get() + s2.get())

console.log(sum.get())

s1.put(10)

console.log(sum.get())

