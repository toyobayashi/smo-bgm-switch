import { Emitter } from './base.js'

class Track {
  #gainNode

  /**
   * @param {AudioContext} ac 
   */
  constructor (ac, active) {
    this.#gainNode = ac.createGain()
    if (!active) {
      this.#gainNode.gain.value = 0
    }
    this.#gainNode.connect(ac.destination)
    this.audio = new Audio()
    this.source = ac.createMediaElementSource(this.audio)
    this.source.connect(this.#gainNode)
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

  #duration = 0

  tracks = [new Track(this.#ctx, true), new Track(this.#ctx, false)]
  activeTrack = 0
  baseTrack = this.tracks[0]

  loop = false

  get currentTime () {
    return this.baseTrack.audio.currentTime
  }

  set currentTime (value) {
    this.tracks.forEach((t) => {
      t.audio.currentTime = value
    })
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

  setBaseTrack () {
    let duration = Infinity, index = -1, t = null
    for (let i = this.tracks.length - 1; i >= 0; --i) {
      const track = this.tracks[i]
      track.audio.onended = null
      track.audio.ondurationchange = null
      track.audio.ontimeupdate = null
      track.audio.onplay = null
      track.audio.onpause = null
      track.audio.onerror = null
      const d = track.audio.duration
      if (!(d >= duration)) {
        duration = d
        index = i
        t = track
      }
    }
    t.audio.onended = () => {
      this.emit('ended')
      this.tracks.forEach(track => { track.audio.pause() })
    }
    t.audio.ontimeupdate = () => {
      this.emit('timeupdate')
    }
    t.audio.oncanplay = () => {
      this.emit('canplay')
    }
    t.audio.onplay = () => {
      this.emit('play')
    }
    t.audio.onpause = () => {
      this.emit('pause')
    }
    this.#duration = duration
    this.baseTrack = t
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
    this.#duration = 0
    await Promise.all(srcs.map((src, i) => {
      return new Promise((resolve, reject) => {
        const t = this.tracks[i]
        t.audio.ondurationchange = () => {
          resolve()
        }
        t.audio.onerror = () => {
          reject(new Error('failed to load audio'))
        }
        t.audio.src = src
      })
    }))
    this.setBaseTrack()
    this.emit('durationchange')
  }

  async playRaw (tracks) {
    await this.setRawSrc(tracks)
    this.play()
  }

  play () {
    this.tracks.forEach((t) => {
      t.audio.play()
    })
  }

  pause () {
    this.tracks.forEach((t) => {
      t.audio.pause()
    })
  }

  get paused () {
    return this.baseTrack.audio.paused
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
