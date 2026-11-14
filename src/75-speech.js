/** 语音：录音转 WAV 交给 ASR，朗读用 TTS 返回的音频播放 */

let player = null
/** 朗读排队中的停止标志：置位后下一段不再请求 */
let stopped = false

/** 停止当前朗读并释放音频元素；同时让排队中的下一段放弃 */
function stopReadAloud() {
  stopped = true
  if (player === null) return
  player.pause()
  player.src = ''
  player = null
}

/**
 * 朗读一段文本。ASR/TTS 都走 Host 代理，音频以 blob 形式返回后直接播放。
 *
 * TTS 单次上限 10000 个计费字符（汉字算 2），超了服务端直接 400。
 * 长回答按段落切成若干段连续播放，任一段失败就整体停止并抛出。
 *
 * @returns 播放结束或被停止时 resolve
 */
async function speak(text) {
  stopReadAloud()
  stopped = false
  const chunks = splitForSpeech(text)
  for (const chunk of chunks) {
    // 用户中途点了停止：后面几段不再请求
    if (stopped) return
    await speakChunk(chunk)
  }
}

/** 单段上限留出余量：按「汉字 2 字符」估算，取 9000 计费字符 */
const SPEECH_BUDGET = 9000

/** 按段落切分，单段超预算时再按句子切，保证每段都在 TTS 限制内 */
function splitForSpeech(text) {
  const cost = (value) => Array.from(value).reduce((sum, char) => sum + (/[\u4e00-\u9fff]/.test(char) ? 2 : 1), 0)
  if (cost(text) <= SPEECH_BUDGET) return [text]

  const chunks = []
  let current = ''
  const push = () => {
    if (current.trim() !== '') chunks.push(current)
    current = ''
  }
  for (const paragraph of text.split(/\n{2,}/)) {
    if (cost(current) + cost(paragraph) <= SPEECH_BUDGET) {
      current += (current === '' ? '' : '\n\n') + paragraph
      continue
    }
    push()
    if (cost(paragraph) <= SPEECH_BUDGET) {
      current = paragraph
      continue
    }
    // 单段就超预算：按句号切
    for (const sentence of paragraph.split(/(?<=[。！？!?.])\s*/)) {
      if (cost(current) + cost(sentence) > SPEECH_BUDGET) push()
      current += sentence
    }
  }
  push()
  return chunks
}

/** 播放一段：请求 TTS 并等音频放完 */
async function speakChunk(text) {
  const blob = await synthesize(text)
  if (stopped) return
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  player = audio
  try {
    await audio.play()
    await new Promise((resolve, reject) => {
      audio.addEventListener('ended', resolve, { once: true })
      audio.addEventListener('error', () => reject(new Error('音频播放失败')), { once: true })
      audio.addEventListener('pause', resolve, { once: true })
    })
  } finally {
    if (player === audio) player = null
    URL.revokeObjectURL(url)
  }
}

/** ASR 单次上限 120 秒，留 2 秒余量给上传与解码 */
const RECORDING_LIMIT_MS = 118_000

/** 人声频段：按对数分布到各柱，与官方 chat-demo 一致 */
const SPECTRUM_LOW = 100
const SPECTRUM_HIGH = 4000
/** dB 映射区间：低于底噪不起跳，避免环境噪声让柱子常亮 */
const SPECTRUM_DB_FLOOR = -80
const SPECTRUM_DB_CEIL = -25
/** 人声高频能量自然衰减，按倍频程补偿，避免右侧常年贴底 */
const SPECTRUM_TILT_PER_OCTAVE = 4

/**
 * 录音中的实时频谱：从左到右低频到高频。
 * 每帧直接改 transform，不触发 React 渲染。
 */
function Spectrum({ getAnalyser }) {
  const rootRef = useRef(null)
  const [count, setCount] = useState(0)

  // 按容器宽度决定柱数：2px 柱 + 3px 间距
  useEffect(() => {
    const root = rootRef.current
    if (root === null) return undefined
    const observer = new ResizeObserver(([entry]) => {
      const fit = Math.floor((entry.contentRect.width + 3) / (2 + 3))
      setCount(Math.max(0, Math.min(60, fit)))
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (root === null || count < 1) return undefined
    const bars = Array.from(root.children)
    const levels = new Float32Array(count)
    const targets = new Float32Array(count)
    const tilts = new Float32Array(count)
    for (let index = 0; index < count; index += 1) {
      tilts[index] = SPECTRUM_TILT_PER_OCTAVE * Math.log2(SPECTRUM_HIGH / SPECTRUM_LOW) * (index / count)
    }
    let data = new Float32Array(0)
    let ranges = []
    let rangeKey = ''
    let frame = 0

    const draw = () => {
      frame = requestAnimationFrame(draw)
      const analyser = getAnalyser()
      if (analyser !== null && analyser !== undefined) {
        if (data.length !== analyser.frequencyBinCount) data = new Float32Array(analyser.frequencyBinCount)
        const key = `${analyser.context.sampleRate}:${analyser.fftSize}`
        const binWidth = analyser.context.sampleRate / analyser.fftSize
        if (key !== rangeKey) {
          rangeKey = key
          ranges = countRanges(count, binWidth, data.length)
        }
        analyser.getFloatFrequencyData(data)
      }
      for (let index = 0; index < count; index += 1) {
        let target = 0
        if (analyser !== null && analyser !== undefined && ranges.length === count) {
          const { from, to, center } = ranges[index]
          let peak = -Infinity
          if (to - from <= 1) {
            const base = Math.min(data.length - 2, Math.floor(center))
            const weight = center - base
            peak = data[base] * (1 - weight) + data[base + 1] * weight
          } else {
            for (let bin = from; bin < to; bin += 1) peak = Math.max(peak, data[bin])
          }
          const db = peak + tilts[index]
          target = Math.min(1, Math.max(0, (db - SPECTRUM_DB_FLOOR) / (SPECTRUM_DB_CEIL - SPECTRUM_DB_FLOOR)))
        }
        targets[index] = target
      }
      for (let index = 0; index < count; index += 1) {
        // 与相邻频段加权平均，填平谐波之间的空隙
        const prev = targets[Math.max(0, index - 1)]
        const next = targets[Math.min(count - 1, index + 1)]
        const target = (prev + targets[index] * 2 + next) / 4
        // 起几乎即时、落稍缓：不闪烁也不拖尾
        levels[index] += (target - levels[index]) * (target > levels[index] ? 0.8 : 0.35)
        const height = 5 + 31 * levels[index]
        bars[index].style.transform = `scaleY(${height / 5})`
      }
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [count, getAnalyser])

  return h('div', { ref: rootRef, className: 'dsa-spectrum', 'aria-hidden': true },
    Array.from({ length: count }, (_, index) => h('span', { key: index, className: 'dsa-spectrum-bar' })),
  )
}

/** 把频段按对数切成 n 段，返回每段的 bin 区间与中心位置 */
function countRanges(n, binWidth, binCount) {
  const ranges = []
  const ratio = SPECTRUM_HIGH / SPECTRUM_LOW
  for (let index = 0; index < n; index += 1) {
    const low = SPECTRUM_LOW * ratio ** (index / n)
    const high = SPECTRUM_LOW * ratio ** ((index + 1) / n)
    const from = Math.min(binCount - 1, Math.floor(low / binWidth))
    const to = Math.min(binCount, Math.max(from + 1, Math.ceil(high / binWidth)))
    ranges.push({ from, to, center: Math.sqrt(low * high) / binWidth })
  }
  return ranges
}

/**
 * 把底层异常翻成一句用户能照做的提示。
 * 录音链路的失败点很多（没有设备、权限被拒、被其他程序占用、编码器不可用），
 * 原始 DOMException 的 message 对普通用户没有意义。
 */
function describeRecordingError(error) {
  const name = error?.name ?? ''
  if (name === 'NotAllowedError') return '需要麦克风权限：请在系统或浏览器设置里允许本应用使用麦克风'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '没有找到可用的麦克风设备'
  if (name === 'NotReadableError' || name === 'TrackStartError') return '麦克风被其他程序占用，请关闭占用它的应用后重试'
  if (name === 'SecurityError') return '当前页面不允许使用麦克风（安全策略限制）'
  if (name === 'AbortError') return '录音被中断'
  const message = error?.message ?? String(error)
  return message === '' ? '录音失败' : message
}

/** 该环境到底缺什么：先判断再动手，失败时能直接说清楚 */
function recordingSupport() {
  if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined) {
    return '当前环境没有 mediaDevices（需要安全上下文或桌面端）'
  }
  if (typeof navigator.mediaDevices.getUserMedia !== 'function') return '当前环境不支持 getUserMedia'
  if (typeof window.MediaRecorder !== 'function') return '当前环境不支持 MediaRecorder，无法录音'
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
  if (typeof AudioContextClass !== 'function') return '当前环境不支持 Web Audio'
  return null
}

/**
 * 录音器：用 MediaRecorder 采集，结束后解成 16 位单声道 WAV。
 * ASR 只接受 16 位 PCM WAV 与 Ogg Opus，浏览器录出来通常是 webm/opus，
 * 所以在本地解码后重采样成 WAV，避免服务端直接拒绝。
 *
 * ASR 单次上限 120 秒、8 MiB，因此录到上限会自动停止并回调 onLimit。
 */
class Recorder {
  #stream = null
  #recorder = null
  #chunks = []
  #analyser = null
  #audioContext = null
  #limitTimer = null
  #deviceLabel = ''

  /** 请求麦克风并开始录音；到 120 秒自动停止并触发 onLimit */
  async start({ onLimit, deviceId } = {}) {
    const missing = recordingSupport()
    if (missing !== null) throw new Error(missing)

    // 优先用用户选定的设备；没选就用系统默认。
    // 系统默认可能是一个虚拟声卡（例如 Steam Streaming Speakers），
    // 那种设备会「成功」返回一条静音轨道，录出来什么都没有，所以下面还要做静音检测。
    const constraints = {
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        ...(deviceId === undefined || deviceId === '' ? {} : { deviceId: { exact: deviceId } }),
      },
    }
    try {
      this.#stream = await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
      throw new Error(describeRecordingError(error))
    }

    this.#deviceLabel = this.#stream.getAudioTracks()[0]?.label ?? ''
    this.#chunks = []
    try {
      this.#recorder = new MediaRecorder(this.#stream)
    } catch (error) {
      this.#release()
      throw new Error(`无法创建录音器：${describeRecordingError(error)}`)
    }
    this.#recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) this.#chunks.push(event.data)
    })
    this.#recorder.start()

    // 频谱只是装饰：AudioContext 建不起来时不该让录音整体失败
    try {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
      this.#audioContext = new AudioContextClass()
      const source = this.#audioContext.createMediaStreamSource(this.#stream)
      this.#analyser = this.#audioContext.createAnalyser()
      this.#analyser.fftSize = 64
      source.connect(this.#analyser)
    } catch {
      this.#analyser = null
    }

    if (typeof onLimit === 'function') {
      this.#limitTimer = setTimeout(() => {
        this.#limitTimer = null
        onLimit()
      }, RECORDING_LIMIT_MS)
    }
    return this
  }

  /**
   * 把 [100, 4000] Hz 的人声频段按对数切成 count 段，返回每段的 bin 区间。
   * 低频段窄于一个 bin 时用中心位置插值，否则相邻几根柱子会完全同步。
   */
  ranges(count) {
    if (this.#analyser === null) return []
    const binWidth = this.#analyser.context.sampleRate / this.#analyser.fftSize
    const binCount = this.#analyser.frequencyBinCount
    const ratio = SPECTRUM_HIGH / SPECTRUM_LOW
    const ranges = []
    for (let index = 0; index < count; index += 1) {
      const low = SPECTRUM_LOW * ratio ** (index / count)
      const high = SPECTRUM_LOW * ratio ** ((index + 1) / count)
      const from = Math.min(binCount - 1, Math.floor(low / binWidth))
      const to = Math.min(binCount, Math.max(from + 1, Math.ceil(high / binWidth)))
      ranges.push({ from, to, center: Math.sqrt(low * high) / binWidth })
    }
    return ranges
  }

  /** 频谱分析节点；没有就返回 null，界面退化成静态 */
  analyser() {
    return this.#analyser
  }

  /** 停止并返回 WAV blob */
  async stop() {
    const recorder = this.#recorder
    if (recorder === null) return null
    const stopped = new Promise((resolve) => {
      recorder.addEventListener('stop', resolve, { once: true })
    })
    recorder.stop()
    await stopped
    const type = recorder.mimeType || 'audio/webm'
    const blob = new Blob(this.#chunks, { type })
    const deviceLabel = this.#deviceLabel
    this.#release()
    if (blob.size === 0) throw new Error('没有录到声音，请检查麦克风后重试')
    let wav
    try {
      wav = await toWav(blob)
    } catch (error) {
      // 解码失败最常见的原因是编码不被支持（例如容器里没有 opus 解码器）
      throw new Error(`录音格式无法处理（${type}）：${describeRecordingError(error)}`)
    }
    // 全静音说明音频这条路是通的但没采到声音，几乎都是设备选错了
    // （系统默认可能是虚拟声卡，比如 Steam Streaming Speakers）。
    if (await isSilentWav(wav)) {
      throw new Error(
        `录到的是一条静音轨道（设备：${deviceLabel || '默认设备'}）。` +
          '请在设置里换一个麦克风，或检查系统默认录音设备。',
      )
    }
    return wav
  }

  /** 取消录音，不产出任何数据 */
  cancel() {
    try {
      this.#recorder?.stop()
    } catch {
      // 已经停止时忽略
    }
    this.#release()
  }

  #release() {
    if (this.#limitTimer !== null) {
      clearTimeout(this.#limitTimer)
      this.#limitTimer = null
    }
    this.#stream?.getTracks().forEach((track) => track.stop())
    this.#stream = null
    this.#recorder = null
    this.#analyser = null
    this.#audioContext?.close().catch(() => {})
    this.#audioContext = null
  }
}

/**
 * 异步判定 WAV 是否全静音。
 * 阈值取 0.004（约 -48 dBFS）：正常说话远高于它，而虚拟声卡的静音是精确的 0。
 */
async function isSilentWav(wavBlob) {
  try {
    const buffer = await wavBlob.arrayBuffer()
    const view = new DataView(buffer)
    if (buffer.byteLength <= 44) return true
    // 找 data 段起点：标准 44 字节头之后即采样数据
    let peak = 0
    for (let offset = 44; offset + 1 < buffer.byteLength; offset += 2) {
      const sample = Math.abs(view.getInt16(offset, true))
      if (sample > peak) {
        peak = sample
        if (peak > SILENCE_THRESHOLD) return false
      }
    }
    return peak <= SILENCE_THRESHOLD
  } catch {
    return false
  }
}

/** 约 -48 dBFS */
const SILENCE_THRESHOLD = 12

/** 解码任意浏览器可解的音频，重采样为 16 kHz 16 位单声道 WAV */
async function toWav(blob) {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
  if (typeof AudioContextClass !== 'function') {
    throw new Error('当前环境不支持 Web Audio，无法处理录音')
  }
  const context = new AudioContextClass()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    // 用 OfflineAudioContext 做重采样：它按规范做带限插值，
    // 比手写的线性插值更不容易在降采样时产生混叠，也更贴近官方插件的做法。
    const frames = Math.max(1, Math.floor(decoded.duration * 16000))
    const OfflineClass = window.OfflineAudioContext ?? window.webkitOfflineAudioContext
    if (typeof OfflineClass !== 'function') {
      // 极老环境退回本地插值
      return encodeWav(downmix(decoded), decoded.sampleRate)
    }
    const offline = new OfflineClass(1, frames, 16000)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return encodeWav(rendered.getChannelData(0), 16000)
  } finally {
    context.close().catch(() => {})
  }
}

/** 多声道合并成单声道 */
function downmix(buffer) {
  const channels = buffer.numberOfChannels
  if (channels === 1) return buffer.getChannelData(0)
  const length = buffer.length
  const output = new Float32Array(length)
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let index = 0; index < length; index += 1) output[index] += data[index] / channels
  }
  return output
}

/** 写一个 44 字节头的 WAV；ASR 支持 8000/16000/22050/24000/32000/44100/48000 */
function encodeWav(samples, sourceRate) {
  const targetRate = pickRate(sourceRate)
  const resampled = targetRate === sourceRate ? samples : resample(samples, sourceRate, targetRate)
  const bytes = new ArrayBuffer(44 + resampled.length * 2)
  const view = new DataView(bytes)
  const writeText = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index))
  }
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + resampled.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, targetRate, true)
  view.setUint32(28, targetRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, resampled.length * 2, true)
  let offset = 44
  for (const sample of resampled) {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += 2
  }
  return new Blob([bytes], { type: 'audio/wav' })
}

const SUPPORTED_RATES = [48000, 44100, 32000, 24000, 22050, 16000, 8000]

/** 选一个受支持的采样率：取不超过源采样率的最近一档 */
const pickRate = (rate) => SUPPORTED_RATES.find((candidate) => candidate <= rate) ?? 16000

/** 线性插值重采样，语音识别够用 */
function resample(samples, from, to) {
  const ratio = from / to
  const length = Math.floor(samples.length / ratio)
  const output = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio
    const left = Math.floor(position)
    const right = Math.min(samples.length - 1, left + 1)
    const weight = position - left
    output[index] = samples[left] * (1 - weight) + samples[right] * weight
  }
  return output
}

/** 麦克风不可用时的统一提示 */
const micUnavailable = () => {
  throw new Error('浏览器没有麦克风权限，或当前环境不支持录音')
}
