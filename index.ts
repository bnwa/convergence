let id = 0
function Id() { return ++id }
const idMap: WeakMap<Signal,number> = new WeakMap

let stackGen = 0
let stackFrame = 0
const stackFrames = [0]

const SAME_GEN_PUT =
  `Cannot update signal twice in same generation of stack frames`

type Signal = {
  get() : unknown
}

class Notifier {
  private readonly pending: Set<number> = new Set
  private readonly dirtyMap: Map<number,boolean> = new Map
  private readonly observers: Set<number> = new Set
  private readonly subMap: Map<number,Set<number>> = new Map
  private readonly fnMap: Map<number, () => void> = new Map

  registerSubject(id: number) {
    const { dirtyMap } = this
    dirtyMap.set(id, true)
  }

  registerObserver(observerId: number, fn: () => void) {
    if (stackFrame !== 0) throw new Error(`Illegal Observation Attempt`)
    this.dirtyMap.set(observerId, true)
    this.observers.add(observerId)
    this.pending.add(observerId)
    this.fnMap.set(observerId, fn)
    stackGen++
    stackFrame = stackFrames.push(id) - 1
    fn()
    this.didNotify(id)
    stackFrames.pop()
    stackFrame--
    // Remove before microtask queue is processed
    this.pending.delete(observerId)
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

  hasUpdate(id: number) {
    return this.dirtyMap.get(id) ?? false
  }

  notify(id: number) {
    const { observers } = this
    const { dirtyMap } = this
    const { pending } = this
    const { subMap } = this
    const subs = subMap.get(id) as Set<number>
    dirtyMap.set(id, true)
    for (const subId of subs) {
      dirtyMap.set(subId, true)
      if (!observers.has(subId)) continue
      else if (pending.has(subId)) continue
      else pending.add(subId)
    }
    queueMicrotask(() => { if (stackFrame === 0) this.sendPending() })
  }

  didNotify(id: number) {
    this.dirtyMap.set(id, false)
  }

  sendPending() {
    const { dirtyMap } = this
    const { pending } = this
    const { fnMap } = this
    for (const id of pending) {
      const fn = fnMap.get(id) as () => void
      fn()
      dirtyMap.set(id, false)
    }
    pending.clear()
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
    const currentId = stackFrames[stackFrame]
    if (genUpdated !== stackGen) {
      this.genUpdated = stackGen
    }
    if (stackFrame === 0) {
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
    const isValidFrame = stackFrame === 0
    //const isValidGen = genUpdated !== stackGen

    if (!isValidFrame) throw new Error(`Illegal stackframe ${stackFrame}`)
    //if (!isValidGen) throw new Error(`Illegal update: Update Gen ${genUpdated} == Current Gen ${stackGen}`)

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
    const currentId = stackFrames[stackFrame]
    if (stackFrame === 0) {
      stackGen++
    }
    if (currentId !== 0 && notifier.hasObserver(id, currentId)) {
      let i = stackFrame
      while(i) notifier.observe(id, stackFrames[i--])
    }
    if (genVisited === stackGen || !notifier.hasUpdate(id)) {
      console.log(`Visited ${id} - No Compute - Gen#${stackGen} - Frame#${currentId}`)
      return this.memo
    }
    stackFrame = stackFrames.push(id) - 1
    const value = this.memo = this.fn()
    this.genVisited = stackGen
    notifier.didNotify(id)
    stackFrames.pop()
    stackFrame--
    console.log(`Visited ${id} - Had Compute - Gen#${stackGen} - Frame#${currentId}`)
    if (stackFrame === 0) queueMicrotask(() => notifier.sendPending())
    return value
  }

  static of<T>(fn: () => T) : Computed<T> { return new Computed(fn) }
}

const Effect = {
  run(fn: () => void) {
    const id = Id()
    notifier.registerObserver(id, fn)
  }
}

const s1 = State.of(5)
const s2 = State.of(5)
const sum = Computed.of(() => s1.get() + s2.get())

Effect.run(() => console.log(`${s1.get()} + ${s2.get()} = ${sum.get()}`))

s1.put(10)
