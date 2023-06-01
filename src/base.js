/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

class Node {
  static Undefined = new Node(undefined)

  constructor(element) {
    this.element = element
    this.next = Node.Undefined
    this.prev = Node.Undefined
  }
}

export class LinkedList {
  _first = Node.Undefined
  _last = Node.Undefined
  _size = 0

  get size () {
    return this._size
  }

  isEmpty () {
    return this._first === Node.Undefined
  }

  clear () {
    let node = this._first
    while (node !== Node.Undefined) {
      const next = node.next
      node.prev = Node.Undefined
      node.next = Node.Undefined
      node = next
    }

    this._first = Node.Undefined
    this._last = Node.Undefined
    this._size = 0
  }

  unshift(element) {
    return this._insert(element, false)
  }

  push(element) {
    return this._insert(element, true)
  }

  _insert(element, atTheEnd) {
    const newNode = new Node(element)
    if (this._first === Node.Undefined) {
      this._first = newNode
      this._last = newNode
    } else if (atTheEnd) {
      const oldLast = this._last
      this._last = newNode
      newNode.prev = oldLast
      oldLast.next = newNode
    } else {
      const oldFirst = this._first
      this._first = newNode
      newNode.next = oldFirst
      oldFirst.prev = newNode
    }
    this._size += 1
    let didRemove = false
    return () => {
      if (!didRemove) {
        didRemove = true
        this._remove(newNode)
      }
    }
  }

  shift() {
    if (this._first === Node.Undefined) {
      return undefined
    } else {
      const res = this._first.element
      this._remove(this._first)
      return res
    }
  }

  pop() {
    if (this._last === Node.Undefined) {
      return undefined
    } else {
      const res = this._last.element
      this._remove(this._last)
      return res
    }
  }

  _remove(node) {
    if (node.prev !== Node.Undefined && node.next !== Node.Undefined) {
      const anchor = node.prev
      anchor.next = node.next
      node.next.prev = anchor
    } else if (node.prev === Node.Undefined && node.next === Node.Undefined) {
      this._first = Node.Undefined
      this._last = Node.Undefined
    } else if (node.next === Node.Undefined) {
      this._last = this._last.prev
      this._last.next = Node.Undefined
    } else if (node.prev === Node.Undefined) {
      this._first = this._first.next
      this._first.prev = Node.Undefined
    }
    this._size -= 1
  }

  *[Symbol.iterator]() {
    let node = this._first
    while (node !== Node.Undefined) {
      yield node.element
      node = node.next
    }
  }
}

export class DisposableStore {
  constructor () {
    this._toDispose = new Set()
    this._isDisposed = false
  }

  get isDisposed() {
    return this._isDisposed
  }

  dispose () {
    if (this._isDisposed) return
    this._isDisposed = true
    this.clear()
  }

  clear () {
    try {
      for (const d of this._toDispose) {
        d.dispose()
      }
    } finally {
      this._toDispose.clear()
    }
  }

  add (o) {
    if (!o) return o
    if (o === this) {
      throw new Error('Cannot register a disposable on itself!')
    }

    if (!this._isDisposed) {
      this._toDispose.add(o)
    }

    return o
  }
}

export class Disposable {
  constructor () {
    this._store = new DisposableStore()
  }

  dispose () {
    this._store.dispose()
  }

  _register (o) {
    if (o === this) {
      throw new Error('Cannot register a disposable on itself!')
    }
    return this._store.add(o)
  }
}

export class SafeDisposable {
  dispose = () => {}
  unset = () => {}
  isset = () => false

  set(fn) {
    let callback = fn
    this.unset = () => callback = undefined
    this.isset = () => callback !== undefined
    this.dispose = () => {
      if (callback) {
        callback()
        callback = undefined
      }
    }
    return this
  }
}

export class Listener {
  constructor (callback, callbackThis) {
    this.subscription = new SafeDisposable()
    this.callback = callback
    this.callbackThis = callbackThis
  }

  invoke (e) {
    this.callback.call(this.callbackThis, e)
  }
}

export class Emitter {
  constructor (options) {
    this._options = options
    this._event = undefined
    this._disposed = false
    this._deliveryQueue = undefined
    this._listeners = undefined
  }

  get event() {
    if (this._event) return this._event
    this._event = (
      callback,
      thisArgs,
      disposables
    ) => {
      if (!this._listeners) this._listeners = new LinkedList()

      const firstListener = this._listeners.isEmpty()
      if (firstListener && this._options?.onFirstListenerAdd) {
        this._options.onFirstListenerAdd(this)
      }

      const listener = new Listener(callback, thisArgs, undefined)
      const removeListener = this._listeners.push(listener)
      if (firstListener && this._options?.onFirstListenerDidAdd) {
        this._options.onFirstListenerDidAdd(this)
      }
      if (this._options?.onListenerDidAdd) {
        this._options.onListenerDidAdd(this, callback, thisArgs)
      }

      const result = listener.subscription.set(() => {
        if (this._disposed) return
        removeListener()
        if (this._options && this._options.onLastListenerRemove) {
          const hasListeners = (this._listeners && !this._listeners.isEmpty())
          if (!hasListeners) {
            this._options.onLastListenerRemove(this)
          }
        }
      })

      if (disposables instanceof DisposableStore) {
        disposables.add(result)
      } else if (Array.isArray(disposables)) {
        disposables.push(result)
      }

      return result
    }
    return this._event
  }

  fire (event) {
    if (!this._listeners) return
    if (!this._deliveryQueue) {
      this._deliveryQueue = new LinkedList()
    }

    for (let listener of this._listeners) {
      this._deliveryQueue.push([listener, event])
    }

    let errors = []
    while (this._deliveryQueue.size > 0) {
      const [listener, event] = this._deliveryQueue.shift()
      try {
        listener.invoke(event)
      } catch (e) {
        errors.push(e)
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, errors[0].message)
    }
  }

  dispose () {
    if (this._disposed) return
    this._disposed = true
    if (this._listeners) this._listeners.clear()
    this._deliveryQueue?.clear()
    this._options?.onLastListenerRemove?.()
  }

  hasListeners () {
    if (!this._listeners) return false
    return (!this._listeners.isEmpty())
  }
}

export function append (parent, ...children) {
	parent.append(...children);
	if (children.length === 1 && typeof children[0] !== 'string') {
		return children[0]
	}
}

const SELECTOR_REGEX = /([\w\-]+)?(#([\w\-]+))?((\.([\w\-]+))*)/;

const Namespace = {
  HTML: 'http://www.w3.org/1999/xhtml',
	SVG: 'http://www.w3.org/2000/svg'
}

function _$(namespace, description, attrs, ...children) {
	const match = SELECTOR_REGEX.exec(description);

	if (!match) {
		throw new Error('Bad use of emmet');
	}

	const tagName = match[1] || 'div';
	let result;

	if (namespace !== Namespace.HTML) {
		result = document.createElementNS(namespace, tagName);
	} else {
		result = document.createElement(tagName);
	}

	if (match[3]) {
		result.id = match[3];
	}
	if (match[4]) {
		result.className = match[4].replace(/\./g, ' ').trim();
	}

	if (attrs) {
		Object.entries(attrs).forEach(([name, value]) => {
			if (typeof value === 'undefined') {
				return;
			}

			if (/^on\w+$/.test(name)) {
				(result)[name] = value;
			} else if (name === 'selected') {
				if (value) {
					result.setAttribute(name, 'true');
				}

			} else {
				result.setAttribute(name, value);
			}
		});
	}

	result.append(...children);

	return result;
}

export function $ (description, attrs, ...children) {
	return _$(Namespace.HTML, description, attrs, ...children);
}

$.SVG = function (description, attrs, ...children) {
	return _$(Namespace.SVG, description, attrs, ...children);
}

export function addDisposableListener (el, type, callback, options) {
  el.addEventListener(type, callback, options)
  return {
    dispose () {
      if (!callback) {
        return
      }
      callback = null
      el.removeEventListener(type, callback, options)
    }
  }
}

export function createStyleSheet(container = document.getElementsByTagName('head')[0], beforeAppend) {
	const style = document.createElement('style');
	style.type = 'text/css';
	style.media = 'screen';
	beforeAppend?.(style);
	container.appendChild(style);
	return style;
}

let _sharedStyleSheet = null;
function getSharedStyleSheet() {
	if (!_sharedStyleSheet) {
		_sharedStyleSheet = createStyleSheet();
	}
	return _sharedStyleSheet;
}

export function createCSSRule(selector, cssText, style = getSharedStyleSheet()) {
	if (!style || !cssText) {
		return;
	}

	(style.sheet).insertRule(selector + '{' + cssText + '}', 0);
}
