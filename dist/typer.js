'use strict';

class Queue {
  constructor (opts = {}) {
    Object.assign(this, {
      onQueueStart () {},
      onQueueEnd () {},
      onQueueCancel () {},
      onElementStart () {},
      onElementEnd () {},
    }, opts);

    this.chain = [];
    this.isCancelled = false;
  }

  async add (fn) {
    if (this.chain.length === 0) {
      let wasCancelled = false;

      this.onQueueStart();
      this.chain.push(fn);

      while (this.chain.length > 0) {
        this.onElementStart();
        this.chain[0] = this.chain[0]();
        await this.chain[0];
        this.onElementEnd();

        if (this.isCancelled) {
          wasCancelled = true;
          break
        }

        this.chain.shift();
      }

      if (!wasCancelled) this.onQueueEnd();
    } else {
      this.chain.push(fn);
    }
  }

  async cancel () {
    if (this.chain.length === 0) return

    this.isCancelled = true;
    await this.chain[0];
    this.chain = [];
    this.isCancelled = false;

    this.onQueueCancel();
  }
}

class Typer {
  constructor (opts = {}) {
    Object.assign(this, {
      speed: 15,
      pauseTime: 500,
      ignored: '[data-opened-by]',
      hiddenClass: 'is-hidden',
      beforeTypingNodes (nodes) {},
      afterTypingNodes (nodes) {},
      beforeTypingNode (node) {},
      afterTypingNode (node) {}
    }, opts);

    if (typeof window === 'undefined') {
      throw new Error('Typer is meant to be ran in a browser')
    }

    this.queue = new Queue();
  }

  async type (elements, shouldNotPause) {
    // Prepare and normalize arguments
    if (elements instanceof HTMLElement) elements = [elements];
    const pauseTime = shouldNotPause ? 0 : this.pauseTime;

    // Get all element nodes and hide them, get all text nodes and clear them
    const nodes = this.getRecursiveNodes(elements);

    // Wait for a potential active typing operation to finish and clear the queue
    await this.queue.cancel();

    // Add before hook to the queue
    this.queue.add(() => this.beforeTypingNodes(nodes));

    // Add before hook to the queue
    for (const [i, node] of nodes.entries()) {
      this.queueNode(node, i, pauseTime);
    }

    // Add after hook to the queue
    this.queue.add(() => this.afterTypingNodes(nodes));

    return nodes
  }

  getRecursiveNodes (elements) {
    let collection = [];

    for (const node of elements) {
      // If node is the special string 'pause', add it to the collection as-is
      if (node === 'pause') {
        collection.push(node);

        // If node is an element, recursively process it
      } else if (node.nodeType === Node.ELEMENT_NODE && !node.matches(this.ignored)) {
        node.classList.add(this.hiddenClass);
        collection.push(node);

        // If node has children, recursively add them to the collection
        if (node.childNodes.length > 0) {
          collection = collection.concat(this.getRecursiveNodes(node.childNodes));
        }

      // If node is a text node, store the original text in the node and clear its content
      } else if (node.nodeType === Node.TEXT_NODE) {
        node.originalText = node.textContent;
        node.textContent = '';
        collection.push(node);
      }
    }

    return collection
  }

  queueNode (node, i, pauseTime) {
    if (node !== 'pause') this.queue.add(() => this.beforeTypingNode(node));

    // If we reached the special token 'pause', wait for `pauseTime` ms
    if (node === 'pause') {
      this.queue.add(() => new Promise(resolve => window.setTimeout(resolve, pauseTime)));

      // If node is an element, remove the inline display:none style we applied
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // If this is not the first node typed in the current action,
      // wait for `pauseTime` ms before inputting a new paragraph
      if (node.nodeName === 'P' && i !== 0) {
        this.queue.add(() => new Promise(resolve => window.setTimeout(resolve, pauseTime)));
      }

      node.classList.remove(this.hiddenClass);

    // Otherwise, type the element
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.originalText;

      for (let i = 0; i < text.length; i++) {
        this.queue.add(() => new Promise(resolve => {
          window.setTimeout(() => {
            node.textContent = text.slice(0, i + 1);
            resolve();
          }, this.speed);
        }));
      }
    }

    if (node !== 'pause') this.queue.add(() => this.afterTypingNode(node));
  }
}

module.exports = Typer;
