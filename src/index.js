import { Disposable, Emitter, addDisposableListener, $, append, createStyleSheet, createCSSRule } from './base.js'
import { Player } from './player.js'

function formatTime (s) {
  const minute = Math.floor(s / 60)
  const sec = Math.floor(s) % 60
  return `${('0' + minute).slice(-2)}:${('0' + sec).slice(-2)}`
}

class MusicGroup {
  constructor (name) {
    const dir = './assets'
    this.name = name
    this._8bitName = name + ' 8bit版'
    this.src = dir + '/' + this.name + '.mp3'
    this._8bitSrc = dir + '/' + this._8bitName + '.mp3'
  }
}

class PlayerModel {
  #onChange = new Emitter()
  get onChange () { return this.#onChange.event }

  #currentPlaying = null

  get currentPlaying () { return this.#currentPlaying }
  set currentPlaying (value) {
    this.#currentPlaying = value
    this.#onChange.fire(value)
  }

  playList = [
    new MusicGroup('ダイナフォー'),
    new MusicGroup('アッチーニャ遺跡'),
    new MusicGroup('アッチーニャ 夜'),
    new MusicGroup('スチームガーデン'),
    new MusicGroup('ドレッシーバレー'),
    new MusicGroup('ロス島'),
    new MusicGroup('Jump Up，Super Star！NDCフェスティバルエディション'),
    new MusicGroup('地下の発電所'),
    new MusicGroup('シュワシュワーナ'),
    new MusicGroup('ホーダン伯爵戦'),
    new MusicGroup('ボルボーノ'),
    new MusicGroup('クッパ城'),
    new MusicGroup('ハニークレーター'),
    new MusicGroup('ハニークレーター 崩落'),
    new MusicGroup('Break Free（Lead the Way）'),
    new MusicGroup('さかさピラミッド内部'),
    new MusicGroup('アスレチックステージ2')
  ]
}

class PlayerList extends Disposable {
  static style

  constructor (container, model) {
    super()
    if (!PlayerList.style) {
      PlayerList.style = createStyleSheet()
      createCSSRule('.play-list-item:hover', 'background: #eee;', PlayerList.style)
    }
    const domNode = $('ul')
    append(container, domNode)
    this.domNode = domNode

    for (let i = 0; i < model.playList.length; ++i) {
      const music = model.playList[i]
      const record = $('li')
      record.innerText = music.name
      record.style.cursor = 'pointer'
      record.className = 'play-list-item'
      record.dataset.name = music.name
      append(domNode, record)
    }

    this._register(addDisposableListener(domNode, 'click', (e) => {
      const target = e.target
      const name = target.dataset.name
      if (model.currentPlaying && model.currentPlaying.name === name) return
      const music = model.playList.filter(m => m.name === name)[0]
      model.currentPlaying = music
      /** @type {HTMLUListElement} */
      const currentTarget = e.currentTarget
      Array.prototype.forEach.call(currentTarget.children, (r) => {
        if (r === target) {
          r.style.color = 'red'
        } else {
          r.style.color = ''
        }
      })
    }))
  }
}

class PlayerComponent extends Disposable {
  constructor (container, model) {
    super()
    const domNode = $('div')
    append(container, domNode)
    const timerange = $('div')
    append(domNode, timerange)
    const buttons = $('div')
    append(domNode, buttons)
    this.domNode = domNode

    this.currentTime = $('span')
    append(timerange, this.currentTime)
    this.currentTime.style.textAlign = 'center'
    this.currentTime.style.display = 'inline-block'
    this.currentTime.style.width = '60px'
    this.currentTime.innerText = '00:00'

    this.input = $('input', { type: 'range', min: '0', max: '100', value: '0' })
    append(timerange, this.input)
    this.input.style.width = '200px'
    this._register(addDisposableListener(this.input, 'ontouchstart' in window ? 'touchstart' : 'mousedown', (e) => {
      this.rangeDragging = true
    }))
    this._register(addDisposableListener(this.input, 'ontouchend' in window ? 'touchend' : 'mouseup', (e) => {
      this.rangeDragging = false
      this.initPlayer()
      this.player.currentTime = this.player.duration * Number(this.input.value) / 100
    }))
    this._register(addDisposableListener(this.input, 'input', (e) => {
      this.currentTime.innerText = formatTime(this.player.duration * Number(e.target.value) / 100)
    }))

    this.duration = $('span')
    append(timerange, this.duration)
    this.duration.style.textAlign = 'center'
    this.duration.style.display = 'inline-block'
    this.duration.style.width = '60px'
    this.duration.innerText = '00:00'

    const button = this.playButton = $('button')
    append(buttons, button)
    button.style.width = '60px'
    button.innerText = 'play'

    this._register(addDisposableListener(button, 'click', (e) => {
      this.initPlayer()
      if (button.innerText === 'play') {
        if (this.player.paused) {
          this.player.play()
        }
      } else {
        this.player.pause()
      }
    }))

    this._register(model.onChange((music) => {
      this.initPlayer()
      this.player.loop = true
      this.currentTime.innerText = '00:00'
      this.duration.innerText = '00:00'
      this.input.value = 0
      this.player.playRaw([music.src, music._8bitSrc])
    }))

    const switchButton = $('button')
    append(buttons, switchButton)
    switchButton.style.width = '60px'
    switchButton.innerText = 'switch'
    this._register(addDisposableListener(switchButton, 'click', (e) => {
      this.playWarpPipe()
      this.player.switchActiveTrack()
    }))

    /** @type {Player} */
    this.player = null
  }

  initPlayer () {
    if (!this.player) {
      this.player = new Player()
      this._register(this.player.onDurationChange(() => {
        this.duration.innerText = formatTime(this.player.duration)
        this.input.value = 0
      }))
      this._register(this.player.onTimeUpdate(() => {
        if (!this.rangeDragging) {
          const currentTime = this.player.currentTime
          this.currentTime.innerText = formatTime(currentTime)
          this.input.value = (currentTime / this.player.duration) * 100
        }
      }))

      this._register(this.player.onPlay(() => {
        this.playButton.innerText = 'pause'
      }))
  
      this._register(this.player.onPause(() => {
        this.playButton.innerText = 'play'
      }))
    }
  }

  initSources () {
    this.initPlayer()
    if (!this.warpPipeAudioBufferPromise) {
      this.warpPipeAudioBufferPromise = fetch('./assets/Warp_Pipe.ogg')
        .then(res => res.arrayBuffer())
        .then((buffer) => this.player.decodeAudioBuffer(buffer))
    }
  }

  playWarpPipe () {
    this.initSources()
    this.warpPipeAudioBufferPromise.then(audioBuffer => {
      this.player.playAudioBuffer(audioBuffer)
    })
  }
}

class App extends Disposable {
  static async main () {
    new App(document.body)
  }

  constructor (container) {
    super()
    const playerModel = new PlayerModel()
    const domNode = $('div')
    this._register(new PlayerComponent(domNode, playerModel))
    this._register(new PlayerList(domNode, playerModel))
    this.domNode = domNode
    append(container, this.domNode)
  }
}

App.main()
