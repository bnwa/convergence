let id = 0
function Id() { return ++id }
const idMap: WeakMap<Signal,number> = new WeakMap

let stackGen = 0
let stackFrame = 0
let stackIsInert = false
const stackFrames = [0]

const SAME_GEN_PUT =
  `Cannot update signal twice in same generation of stack frames`

type Signal = {
  get() : unknown
}

// TODO implement Effect
class Notifier {
  private readonly pending: Set<number> = new Set
  private readonly dirtyMap: Map<number,boolean> = new Map
  private readonly observeMap: Map<number,Set<number>> = new Map
  private readonly subMap: Map<number,Set<number>> = new Map
  private readonly depMap: Map<number,Set<number>> = new Map
  private readonly fnMap: Map<number, () => void> = new Map

  registerSubject(id: number) {
    const { dirtyMap } = this
    dirtyMap.set(id, true)
  }

  registerObserver(fn: () => void, observerId: number, ...subjectIds: number[]) {
    const { dirtyMap } = this
    const { observeMap } = this
    const { depMap } = this
    const { fnMap } = this
    // Can't add more subjects to observer
    const deps = new Set<number>()
    for (const sId of subjectIds) {
      const subs = observeMap.has(sId) ?
        observeMap.get(sId) as Set<number> :
        observeMap.set(sId, new Set<number>).get(sId) as Set<number>
      if (subs.has(observerId)) continue
      else subs.add(observerId)
        console.log(`subject#${sId} is being observed by ${observerId}`)
    }
    fnMap.set(observerId, fn)
    depMap.set(observerId, deps)
    // Should check subjects if dirty first? Or next gen?
    dirtyMap.set(observerId, false)
    this.pending.add(observerId)
    this.sendPending()
  }

  observe(id: number, observer: number) {
    const { subMap } = this
    const subs = subMap.has(id) ?
      subMap.get(id) as Set<number> :
      subMap.set(id, new Set).get(id) as Set<number>
    if (subs.has(observer)) return
    else subs.add(observer)
  }

  hasObserver(id: number, subject: number) {
    return this.subMap.get(id)?.has(subject) ?? false
  }

  notified(id: number) {
    const { dirtyMap } = this
    return dirtyMap.has(id) ?
      dirtyMap.get(id) as boolean :
      false
  }

  notify(id: number) {
    const { observeMap } = this
    const { dirtyMap } = this
    const { pending } = this
    const { subMap } = this
    const subs = subMap.get(id) as Set<number>
    dirtyMap.set(id, true)
    if (subs) {
      for (const subId of subs) {
        dirtyMap.set(subId, true)
      }
    }
    if (!observeMap.has(id)) {
      console.log(`Subject#${id} has no observers`)
       return
    }
    const observers = observeMap.get(id) as Set<number>
    for (const oId of observers) {
      pending.add(oId)
      console.log(`Subject#${id} has pending observer#${oId}`)
    }
    queueMicrotask(() => { if (stackFrame === 0) this.sendPending() })
  }

  checked(id: number) {
    const { dirtyMap } = this
    if (dirtyMap.has(id)) dirtyMap.set(id, false)
    else return
  }

  sendPending() {
    const { pending } = this
    const { fnMap } = this
    stackIsInert = true
    for (const id of pending) {
      const fn = fnMap.get(id) as () => void
      fn()
    }
    pending.clear()
    stackIsInert = false
  }
}

const notifier = new Notifier

class State<T> implements Signal {
  private readonly id: number
  private genUpdated = -1
  constructor(private x: T) {
    const id = this.id = Id()
    idMap.set(this, id)
    notifier.registerSubject(id)
  }

  get() : T {
    const { id } = this
    const { genUpdated } = this
    if (stackIsInert) return this.x
    const currentId = stackFrames[stackFrame]
    if (genUpdated !== stackGen) {
      this.genUpdated = stackGen
    }
    if (stackFrame === 0) {
      stackIsInert = false
      stackGen++
    }
    if (currentId !== 0 && !notifier.hasObserver(id, currentId)) {
      let i = stackFrame
      while(i) notifier.observe(id, stackFrames[i--])
    }
    console.log(`Visited ${id} - Signal - Gen#${stackGen} - Frame#${currentId}`)
    if (stackFrame === 0) queueMicrotask(() => notifier.sendPending())
    return this.x
  }

  put(x: T) : State<T> {
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

    if (this.x === x) return this

    this.x = x
    notifier.notify(id)
    return this
  }

  static of<T>(x: T) { return new State(x) }
}

class Computed<T> implements Signal {
  private memo: T
  private readonly id: number
  private genVisited = -1
  constructor(private readonly fn: () => T) {
    const id = this.id = Id()
    idMap.set(this, id)
    notifier.registerSubject(this.id)
  }
  get() :T {
    const { id } = this
    const { genVisited } = this
    if (stackIsInert) return this.fn()
    const currentId = stackFrames[stackFrame]
    if (stackFrame === 0) {
      stackIsInert = false
      stackGen++
    }
    if (currentId !== 0 && notifier.hasObserver(id, currentId)) {
      let i = stackFrame
      while(i) notifier.observe(id, stackFrames[i--])
    }
    if (genVisited === stackGen || !notifier.notified(id)) {
      console.log(`Visited ${id} - No Compute - Gen#${stackGen} - Frame#${currentId}`)
      return this.memo
    }
    stackFrame = stackFrames.push(id) - 1
    const value = this.memo = this.fn()
    this.genVisited = stackGen
    notifier.checked(id)
    stackFrames.pop()
    stackFrame--
    console.log(`Visited ${id} - Had Compute - Gen#${stackGen} - Frame#${currentId}`)
    if (stackFrame === 0) queueMicrotask(() => notifier.sendPending())
    return value
  }

  static of<T>(fn: () => T) : Computed<T> { return new Computed(fn) }
}

class Effect {
  constructor(fn: () => void, deps: Signal[]) {
    notifier.registerObserver(fn, Id(), ...deps.map(s => {
      if (idMap.has(s)) return idMap.get(s) as number
      else throw new Error(`Encountered unidentified signal`)
    }))
  }
  dispose() {}

  static run(fn: () => void, ...deps: Signal[]) {
    return new Effect(fn, deps)
  }
}

const s1 = State.of(5)
const s2 = State.of(5)
const sum = Computed.of(() => s1.get() + s2.get())

Effect.run(() => console.log(`${s1.get()} + ${s2.get()} = ${sum.get()}`),
  s1,
  s2,
  sum)

s1.put(10)
