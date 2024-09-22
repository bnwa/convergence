let id = 0
function Id() { return ++id }

let stackGen = 0
let stackFrame = 0
const stackFrames = [0]

const SAME_GEN_PUT =
  `Cannot update signal twice in same generation of stack frames`

type SignalBuilder = {
  new<T>(x: T) : Signal<T>
}

const signalMap: Map<number,Signal<unknown>|Computed<unknown>> = new Map
const dirtyMap: Map<number,boolean> = new Map

class Signal<T> {
  private readonly id = Id()
  private deps: Array<number> = []
  private numDeps = 0
  private genUpdated = -1
  constructor(private x: T) {
    signalMap.set(this.id, this)
    dirtyMap.set(this.id, true)
  }

  get() : T {
    const { id } = this
    const { deps } = this
    const { genUpdated } = this
    const currentId = stackFrames[stackFrame]
    if (genUpdated !== stackGen) {
      this.genUpdated = stackGen
    }
    if (stackFrame === 0) stackGen++
    if (currentId !== -1 && !deps.includes(currentId)) {
      this.numDeps = this.deps.push(currentId)
    }
    console.log(`Visited ${id} - Signal - Gen#${stackGen} - Frame#${currentId}`)
    return this.x
  }

  put(x: T) : Signal<T> {
    const { id } = this
    const { genUpdated } = this
    const isValid =
      stackFrame === 0 ||
      genUpdated !== stackGen

    if (!isValid) {
      const msg = `${SAME_GEN_PUT}: id#${id} - ` +
        `current frame id: ${stackFrames[stackFrame]} - ` +
        `current generation: ${stackGen} - ` +
        `last updated generation: ${genUpdated}`
      throw new Error(msg)
    }

    this.x = x
    dirtyMap.set(id, true)
    return this
  }

  static of<T>(x: T) { return new Signal(x) }
}

class Computed<T> {
  private memo: T
  private readonly id = Id()
  private deps: Array<number> = []
  private numDeps = 0
  private genVisited = -1
  constructor(private readonly fn: () => T) {}
  get() :T {
    const { id } = this
    const { deps } = this
    const { genVisited } = this
    const currentId = stackFrames[stackFrame]
    if (stackFrame === 0) stackGen++
    if (currentId !== -1 && !deps.includes(currentId)) {
      this.numDeps = this.deps.push(currentId)
    }
    if (genVisited === stackGen) {
      console.log(`Visited ${id} - No Compute - Gen#${stackGen} - Frame#${currentId}`)
      return this.memo
    }
    stackFrame = stackFrames.push(id) - 1
    const value = this.memo = this.fn()
    this.genVisited = stackGen
    stackFrames.pop()
    stackFrame--
    console.log(`Visited ${id} - Had Compute - Gen#${stackGen} - Frame#${currentId}`)
    return value
  }

  static of<T>(fn: () => T) : Computed<T> { return new Computed(fn) }
}

const s1 = Signal.of(5)
const s2 = Signal.of(5)
const sum = Computed.of(() => s1.get() + s2.get())

console.log(sum.get())

s1.put(10)

console.log(sum.get())

const firstCharS = Signal.of("B")
const firstChar = Computed.of(() => firstCharS.get())
const firstName = Computed.of(() => `${firstChar.get()}enoit`)
const lastName = Computed.of(() => `${firstChar.get()}arberousse`)
const fullName = Computed.of(() => `${firstName.get()} ${lastName.get()}`)

console.log(fullName.get())


