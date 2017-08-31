export default class Queue {
  constructor (opts = {}) {
    Object.assign(this, {
      onQueueStart () {},
      onQueueEnd () {},
      onQueueCancel () {},
      onElementStart () {},
      onElementEnd () {},
    }, opts)

    this.chain = []
    this.isCancelled = false
  }

  async add (fn) {
    if (this.chain.length === 0) {
      let wasCancelled = false

      this.onQueueStart()
      this.chain.push(fn)

      while (this.chain.length > 0) {
        this.onElementStart()
        this.chain[0] = this.chain[0]()
        await this.chain[0]
        this.onElementEnd()

        if (this.isCancelled) {
          wasCancelled = true
          break
        }

        this.chain.shift()
      }

      if (!wasCancelled) this.onQueueEnd()
    } else {
      this.chain.push(fn)
    }
  }

  async cancel () {
    if (this.chain.length === 0) return

    this.isCancelled = true
    await this.chain[0]
    this.chain = []
    this.isCancelled = false

    this.onQueueCancel()
  }
}
