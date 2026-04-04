import { useState, useRef, useCallback, useEffect } from 'react'
import './App.css'

const WS_URL = 'ws://localhost:8000/ws/voice'
const SILENCE_THRESHOLD = 50
const SILENCE_DURATION = 1500
const MIN_SPEECH_MS = 800
const VIZ_BARS = 64
const VIZ_INNER_RADIUS = 88
const VIZ_MAX_BAR = 50

const LANG_MAP = {
  english: 'en-US', italian: 'it-IT', spanish: 'es-ES', french: 'fr-FR',
  german: 'de-DE', portuguese: 'pt-BR', dutch: 'nl-NL', russian: 'ru-RU',
  japanese: 'ja-JP', chinese: 'zh-CN', korean: 'ko-KR', arabic: 'ar-SA',
  hindi: 'hi-IN', turkish: 'tr-TR', polish: 'pl-PL', swedish: 'sv-SE',
}

const STATE_COLORS = {
  idle: { r: 59, g: 130, b: 246 },
  listening: { r: 239, g: 68, b: 68 },
  processing: { r: 245, g: 158, b: 11 },
  speaking: { r: 167, g: 139, b: 250 },
}

function pickVoice(langCode) {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length || !langCode) return null
  const lang = langCode.toLowerCase()
  return voices.find((v) => v.lang.toLowerCase().startsWith(lang.split('-')[0])) || null
}

function getSupportedMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [detectedLang, setDetectedLang] = useState(null)
  const [messages, setMessages] = useState([])
  const [timing, setTiming] = useState(null)
  const [streamingReply, setStreamingReply] = useState('')

  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])
  const isActiveRef = useRef(false)
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const silenceCheckRef = useRef(null)
  const canvasRef = useRef(null)
  const vizFrameRef = useRef(null)
  const chatEndRef = useRef(null)
  const wsRef = useRef(null)
  const hadSpeechRef = useRef(false)
  const speechStartRef = useRef(null)
  const langRef = useRef(null)
  const speechQueueRef = useRef([])
  const isSpeakingRef = useRef(false)

  const stateKey = isRecording ? 'listening' : status === 'speaking' ? 'speaking' : status === 'processing' ? 'processing' : 'idle'
  const accent = STATE_COLORS[stateKey]

  useEffect(() => {
    window.speechSynthesis.getVoices()
    const onVoices = () => window.speechSynthesis.getVoices()
    window.speechSynthesis.addEventListener('voiceschanged', onVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', onVoices)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingReply])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accent-r', accent.r)
    root.style.setProperty('--accent-g', accent.g)
    root.style.setProperty('--accent-b', accent.b)
  }, [accent])

  const processQueue = useCallback(() => {
    if (speechQueueRef.current.length === 0) {
      isSpeakingRef.current = false
      if (isActiveRef.current) {
        startRecording()
      } else {
        setStatus('idle')
      }
      return
    }
    isSpeakingRef.current = true
    setStatus('speaking')
    const text = speechQueueRef.current.shift()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.05
    const langCode = langRef.current ? LANG_MAP[langRef.current] || langRef.current : null
    if (langCode) {
      utterance.lang = langCode
      const voice = pickVoice(langCode)
      if (voice) utterance.voice = voice
    }
    utterance.onend = () => processQueue()
    utterance.onerror = () => processQueue()
    window.speechSynthesis.speak(utterance)
  }, [])

  const speakSentence = useCallback((text) => {
    speechQueueRef.current.push(text)
    if (!isSpeakingRef.current) processQueue()
  }, [processQueue])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel()
    speechQueueRef.current = []
    isSpeakingRef.current = false
  }, [])

  const connectWS = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)

      if (msg.type === 'transcript') {
        setMessages((prev) => [...prev, { role: 'user', text: msg.text }])
        if (msg.language) {
          langRef.current = msg.language
          setDetectedLang(msg.language)
        }
        setStatus('processing')
        setStreamingReply('')
      }

      if (msg.type === 'reply_chunk') {
        setStreamingReply((prev) => prev + (prev ? ' ' : '') + msg.text)
        speakSentence(msg.text)
      }

      if (msg.type === 'reply_done') {
        setTiming(msg.timing)
        setStreamingReply('')
        if (msg.full_reply) {
          setMessages((prev) => [...prev, { role: 'assistant', text: msg.full_reply }])
        }
        if (!isSpeakingRef.current) {
          if (isActiveRef.current) {
            startRecording()
          } else {
            setStatus('idle')
          }
        }
      }
    }

    ws.onclose = () => { wsRef.current = null }
    ws.onerror = () => { setError('Connection failed') }
  }, [])

  const startVisualizer = useCallback(() => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const size = 320
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    const smoothed = new Float32Array(VIZ_BARS).fill(0)

    const draw = () => {
      analyser.getByteFrequencyData(dataArray)
      ctx.clearRect(0, 0, size, size)
      const cx = size / 2
      const cy = size / 2

      for (let i = 0; i < VIZ_BARS; i++) {
        const dataIdx = Math.floor((i / VIZ_BARS) * dataArray.length)
        const raw = dataArray[dataIdx] / 255
        smoothed[i] += (raw - smoothed[i]) * 0.3

        const angle = (i / VIZ_BARS) * Math.PI * 2 - Math.PI / 2
        const barH = smoothed[i] * VIZ_MAX_BAR + 2
        const x1 = cx + Math.cos(angle) * VIZ_INNER_RADIUS
        const y1 = cy + Math.sin(angle) * VIZ_INNER_RADIUS
        const x2 = cx + Math.cos(angle) * (VIZ_INNER_RADIUS + barH)
        const y2 = cy + Math.sin(angle) * (VIZ_INNER_RADIUS + barH)

        const a = 0.2 + smoothed[i] * 0.8
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.strokeStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${a})`
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.stroke()
      }
      vizFrameRef.current = requestAnimationFrame(draw)
    }
    vizFrameRef.current = requestAnimationFrame(draw)
  }, [accent])

  const stopAudioAnalysis = useCallback(() => {
    cancelAnimationFrame(silenceCheckRef.current)
    cancelAnimationFrame(vizFrameRef.current)
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
      analyserRef.current = null
    }
  }, [])

  const stopRecordingRaw = useCallback(() => {
    stopAudioAnalysis()
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop()
      setIsRecording(false)
    }
  }, [stopAudioAnalysis])

  const sendAudio = useCallback((blob) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    setStatus('processing')

    const reader = new FileReader()
    reader.onloadend = () => {
      const hex = Array.from(new Uint8Array(reader.result))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      ws.send(JSON.stringify({
        type: 'audio',
        data: hex,
        ext: blob.type.includes('mp4') ? 'mp4' : 'webm',
      }))
    }
    reader.readAsArrayBuffer(blob)
  }, [])

  const startRecording = useCallback(async () => {
    stopSpeaking()
    setError(null)
    hadSpeechRef.current = false
    speechStartRef.current = null

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      audioContextRef.current = audioContext
      analyserRef.current = analyser

      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})

      audioChunks.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const speechDuration = speechStartRef.current
          ? Date.now() - speechStartRef.current
          : 0
        if (hadSpeechRef.current && speechDuration >= MIN_SPEECH_MS) {
          const blob = new Blob(audioChunks.current, { type: recorder.mimeType })
          sendAudio(blob)
        } else if (isActiveRef.current) {
          startRecording()
        }
      }

      recorder.start()
      mediaRecorder.current = recorder
      setIsRecording(true)
      setStatus('listening')
      startVisualizer()

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let silentSince = null

      const check = () => {
        analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length

        if (avg >= SILENCE_THRESHOLD) {
          if (!hadSpeechRef.current) speechStartRef.current = Date.now()
          hadSpeechRef.current = true
          silentSince = null
        } else if (hadSpeechRef.current) {
          if (!silentSince) silentSince = Date.now()
          if (Date.now() - silentSince > SILENCE_DURATION) {
            stopRecordingRaw()
            return
          }
        }
        silenceCheckRef.current = requestAnimationFrame(check)
      }
      silenceCheckRef.current = requestAnimationFrame(check)
    } catch (err) {
      setError('Microphone access denied')
      setStatus('idle')
    }
  }, [sendAudio, startVisualizer, stopRecordingRaw])

  const startSession = useCallback(() => {
    isActiveRef.current = true
    setIsActive(true)
    connectWS()
    setTimeout(() => startRecording(), 100)
  }, [connectWS, startRecording])

  const stopSession = useCallback(() => {
    isActiveRef.current = false
    setIsActive(false)
    stopSpeaking()
    stopAudioAnalysis()
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop()
    }
    setIsRecording(false)
    setStatus('idle')
    setStreamingReply('')
  }, [stopAudioAnalysis, stopSpeaking])

  const clearHistory = useCallback(() => {
    setMessages([])
    setError(null)
    setDetectedLang(null)
    setTiming(null)
    setStreamingReply('')
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'clear' }))
    }
  }, [])

  const statusLabel = {
    idle: isActive ? 'READY' : 'TAP TO BEGIN',
    listening: 'LISTENING',
    processing: 'THINKING',
    speaking: 'SPEAKING',
  }[status]

  return (
    <div className="app" data-state={stateKey}>
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />
      <div className="noise-overlay" />

      <header className="header">
        <h1 className="logo">KOSKI<span className="logo-accent">PLEX</span></h1>
        <div className="header-badges">
          {detectedLang && <span className="lang-pill">{detectedLang}</span>}
          {timing && (
            <span className="timing-pill">
              STT {timing.stt_ms}ms · LLM {timing.llm_first_token_ms}ms · Total {timing.total_ms}ms
            </span>
          )}
        </div>
      </header>

      <main className="main">
        <div className="orb-area">
          <canvas ref={canvasRef} className="viz-canvas" width="320" height="320" />
          <div className="orb-rings">
            <div className="ring ring-1" />
            <div className="ring ring-2" />
            <div className="ring ring-3" />
          </div>
          <button className="orb" onClick={isActive ? stopSession : startSession}>
            <div className="orb-icon">
              {isActive ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              )}
            </div>
          </button>
        </div>

        <p className="status-text">{statusLabel}</p>
        {error && <p className="error-text">{error}</p>}

        {(messages.length > 0 || streamingReply) && (
          <div className="chat">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role === 'user' ? 'chat-user' : 'chat-ai'}`}>
                <span className="chat-role">{msg.role === 'user' ? 'You' : 'KoskiPlex'}</span>
                <p className="chat-text">{msg.text}</p>
              </div>
            ))}
            {streamingReply && (
              <div className="chat-bubble chat-ai chat-streaming">
                <span className="chat-role">KoskiPlex</span>
                <p className="chat-text">{streamingReply}<span className="cursor" /></p>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </main>

      <footer className="controls">
        <button className="ctrl-btn" onClick={clearHistory} title="Clear conversation">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </footer>
    </div>
  )
}

export default App
