import { Emitter } from './base.js'

class Track {
  #gainNode
  source = null
  audioBuffer = null

  /**
   * @param {AudioContext} ac 
   */
  constructor (ac, active) {
    this.#gainNode = ac.createGain()
    if (!active) {
      this.#gainNode.gain.value = 0
    }
    this.#gainNode.connect(ac.destination)
  }

  connect () {
    this.source.connect(this.#gainNode)
  }

  disconnect () {
    this.source.disconnect()
  }

  setActive (value) {
    if (value) {
      if (this.#gainNode.gain.value === 1) {
        return
      }
      const f = () => {
        if (this.#gainNode.gain.value < 1) {
          const value = this.#gainNode.gain.value + 0.01
          this.#gainNode.gain.value = value > 1 ? 1 : value
          requestAnimationFrame(f)
        }
      }
      f()
    } else {
      if (this.#gainNode.gain.value === 0) {
        return
      }
      const f = () => {
        if (this.#gainNode.gain.value > 0) {
          const value = this.#gainNode.gain.value - 0.01
          this.#gainNode.gain.value = value > 0 ? value : 0
          requestAnimationFrame(f)
        }
      }
      f()
    }
  }
}

export class Player {
  #onPlay = new Emitter()
  get onPlay () { return this.#onPlay.event }
  #onPause = new Emitter()
  get onPause () { return this.#onPause.event }
  #onTimeUpdate = new Emitter()
  get onTimeUpdate () { return this.#onTimeUpdate.event }
  #onVolumeChange = new Emitter()
  get onVolumeChange () { return this.#onVolumeChange.event }
  #onEnded = new Emitter()
  get onEnded () { return this.#onEnded.event }
  #onDurationChange = new Emitter()
  get onDurationChange () { return this.#onDurationChange.event }
  #onCanPlay = new Emitter()
  get onCanPlay () { return this.#onCanPlay.event }

  emit (type, e) {
    switch (type) {
      case 'play': { this.#onPlay.fire(e); return }
      case 'pause': { this.#onPause.fire(e); return }
      case 'timeupdate': { this.#onTimeUpdate.fire(e); return }
      case 'volumechange': { this.#onVolumeChange.fire(e); return }
      case 'ended': { this.#onEnded.fire(e); return }
      case 'durationchange': { this.#onDurationChange.fire(e); return }
      case 'canplay': { this.#onCanPlay.fire(e); return }
      default: return
    }
  }

  #ctx = new AudioContext()
  #gainNode = this.#ctx.createGain()

  #startedAt = 0 // absolute time
  #pausedAt = 0 // relative time
  #duration = 0

  tracks = [new Track(this.#ctx, true), new Track(this.#ctx, false)]
  activeTrack = 0

  loop = false
  #loopStart = 0
  #loopEnd = 0
  #timeupdateTimer = 0

  get loopStart () {
    return this.#loopStart
  }

  set loopStart (value) {
    this.#loopStart = value
    this.tracks.forEach((t) => { if (t.source) t.source.loopStart = value })
  }

  get loopEnd () {
    return this.#loopEnd
  }

  set loopEnd (value) {
    this.#loopEnd = value
    this.tracks.forEach((t) => { if (t.source) t.source.loopEnd = value })
  }

  get currentTime () {
    let t = 0
    if (this.#pausedAt) {
      t = this.#pausedAt
      return t
    } else if (this.#startedAt) {
      t = this.#ctx.currentTime - this.#startedAt
      if (this.loop) {
        if (this.loopEnd > 0) {
          while (t > this.loopEnd) {
            this.#startedAt = this.#ctx.currentTime - (this.loopStart + (t - this.loopEnd))
            t = this.#ctx.currentTime - this.#startedAt
          }
        }
        while (t > this.duration) {
          this.#startedAt += this.duration
          t = this.#ctx.currentTime - this.#startedAt
        }
      } else {
        if (t > this.duration) t = this.duration
      }
      return t
    } else {
      return 0
    }
  }

  set currentTime (value) {
    if (this.#pausedAt) {
      this.#pausedAt = value
      return
    }
    if (this.#startedAt) {
      this.tracks.forEach((t) => {
        if (!t.audioBuffer) return
        this._initSource(t, true)
        t.source.start(0, value)
      })
      this.setBaseTrack()
      this.#startedAt = this.#ctx.currentTime - value
      this.#pausedAt = 0

      this.emit('timeupdate')
    }
  }

  get duration () {
    return this.#duration
  }

  get volume () {
    return this.#gainNode.gain.value
  }

  set volume (value) {
    if (Number.isNaN(value)) return
    this.#gainNode.gain.value = value > 1 ? 1 : (value < 0 ? 0 : value)
    this.emit('volumechange')
  }

  constructor () {
    this.#gainNode.connect(this.#ctx.destination)
  }

  _resetSource (t) {
    if (t.source) {
      t.source.onended = null
      t.source.stop()
      t.disconnect()
      t.source = null
    }
  }

  _initSource (t) {
    try {
      this._resetSource(t)
    } catch (_) {}
    t.source = this.#ctx.createBufferSource()
    t.source.buffer = t.audioBuffer
    t.source.loop = this.loop
    t.source.loopStart = this.loopStart || 0
    t.source.loopEnd = this.loopEnd || t.audioBuffer.duration
    t.connect()
  }

  setBaseTrack () {
    let duration = Infinity, index = -1, t = null
    for (let i = 0; i < this.tracks.length; ++i) {
      const track = this.tracks[i]
      if (!track.audioBuffer) continue
      const d = track.audioBuffer.duration
      if (d < duration) {
        duration = d
        index = i
        t = track
      }
    }
    if (t) {
      t.source.onended = () => {
        window.clearInterval(this.#timeupdateTimer)
        this.#timeupdateTimer = 0
        this.emit('ended')
      }
      for (let i = 0; i < this.tracks.length; ++i) {
        const track = this.tracks[i]
        track.source.loopStart = t.source.loopStart
        track.source.loopEnd = t.source.loopEnd
      }
    }
    return duration
  }

  async playAudioBuffer (audioBuffer) {
    let source = this.#ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.#gainNode)
    source.start(0)
    source.onended = () => {
      source.disconnect()
      source = null
    }
  }

  setActiveTrack (index) {
    this.activeTrack = index
    this.tracks.forEach((t, i) => {
      if (i === this.activeTrack) {
        t.setActive(true)
      } else {
        t.setActive(false)
      }
    })
  }

  switchActiveTrack () {
    this.setActiveTrack((this.activeTrack + 1) % 2)
  }

  async setRawSrc (srcs) {
    window.clearInterval(this.#timeupdateTimer)
    this.#timeupdateTimer = 0
    this.#duration = 0
    this.#startedAt = 0
    this.#pausedAt = 0
    await Promise.all(srcs.map(async (src, i) => {
      const t = this.tracks[i]
      this._resetSource(t)
      if (src) {
        if (typeof src === 'string') {
          src = await fetch(src).then(res => res.arrayBuffer())
        }
        t.audioBuffer = await this.decodeAudioBuffer(src)
        this._initSource(t)
      } else {
        t.audioBuffer = null
      }
      return t
    }))
    const duration = this.setBaseTrack()
    this.#duration = duration
    this.emit('durationchange')
    this.emit('canplay')
  }

  async playRaw (tracks) {
    await this.setRawSrc(tracks)
    await this.play()
  }

  async play () {
    const offset = this.#pausedAt
    this.tracks.forEach((t) => {
      if (!t.audioBuffer) {
        throw new Error('no source')
      }
  
      this._initSource(t, true)
      t.source.start(0, offset)
    })
    this.setBaseTrack()
    this.#startedAt = this.#ctx.currentTime - offset
    this.#pausedAt = 0

    this.emit('play')

    window.clearInterval(this.#timeupdateTimer)
    this.emit('timeupdate')
    this.#timeupdateTimer = window.setInterval(() => {
      this.emit('timeupdate')
    }, 250)
  }

  pause () {
    this.tracks.forEach(this._resetSource)
    this.#pausedAt = this.#ctx.currentTime - this.#startedAt
    this.#startedAt = 0
    this.emit('pause')
    window.clearInterval(this.#timeupdateTimer)
    this.#timeupdateTimer = 0
  }

  get paused () {
    return this.#startedAt === 0 && this.#pausedAt > 0
  }

  async decodeAudioBuffer (src) {
    const ac = this.#ctx
    let audioBuffer
    if (typeof src === 'string') {
      let buffer = await fetch(src).then(res => res.arrayBuffer())
      audioBuffer = await ac.decodeAudioData(buffer)
      buffer = null
    } else {
      if (src instanceof ArrayBuffer) {
        audioBuffer = await ac.decodeAudioData(src)
      } else {
        audioBuffer = await ac.decodeAudioData(src.buffer)
      }
    }
    return audioBuffer
  }
}
