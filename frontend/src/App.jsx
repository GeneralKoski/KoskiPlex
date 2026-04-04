import { useState, useRef, useCallback, useEffect } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000'
const MAX_HISTORY = 20
const SILENCE_THRESHOLD = 15
const SILENCE_DURATION = 1500

const LANG_MAP = {
  english: 'en-US', italian: 'it-IT', spanish: 'es-ES', french: 'fr-FR',
  german: 'de-DE', portuguese: 'pt-BR', dutch: 'nl-NL', russian: 'ru-RU',
  japanese: 'ja-JP', chinese: 'zh-CN', korean: 'ko-KR', arabic: 'ar-SA',
  hindi: 'hi-IN', turkish: 'tr-TR', polish: 'pl-PL', swedish: 'sv-SE',
  norwegian: 'nb-NO', danish: 'da-DK', finnish: 'fi-FI', greek: 'el-GR',
  czech: 'cs-CZ', romanian: 'ro-RO', hungarian: 'hu-HU', ukrainian: 'uk-UA',
}

function getSupportedMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

function pickVoice(langCode) {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length || !langCode) return null
  const lang = langCode.toLowerCase()
  return voices.find((v) => v.lang.toLowerCase().startsWith(lang.split('-')[0]))
    || null
}

function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [isConversing, setIsConversing] = useState(false)
  const [isPTT, setIsPTT] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [reply, setReply] = useState('')
  const [status, setStatus] = useState('Ready')
  const [error, setError] = useState(null)
  const [detectedLang, setDetectedLang] = useState(null)

  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])
  const history = useRef([])
  const isConversingRef = useRef(false)
  const isMutedRef = useRef(false)
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const silenceCheckRef = useRef(null)
  const langRef = useRef(null)

  useEffect(() => {
    window.speechSynthesis.getVoices()
    const onVoices = () => window.speechSynthesis.getVoices()
    window.speechSynthesis.addEventListener('voiceschanged', onVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', onVoices)
  }, [])

  const stopSilenceDetection = useCallback(() => {
    cancelAnimationFrame(silenceCheckRef.current)
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
  }, [])

  const speakReply = useCallback((text) => {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.05

    const langCode = langRef.current ? LANG_MAP[langRef.current] || langRef.current : null
    if (langCode) {
      utterance.lang = langCode
      const voice = pickVoice(langCode)
      if (voice) utterance.voice = voice
    }

    utterance.onstart = () => setStatus('Speaking...')
    utterance.onend = () => {
      if (isConversingRef.current && !isMutedRef.current) {
        startRecording()
      } else {
        setStatus(isConversingRef.current ? 'Muted' : 'Ready')
      }
    }
    window.speechSynthesis.speak(utterance)
  }, [])

  const handleAudioReady = useCallback(async (blob) => {
    setStatus('Processing...')
    setError(null)

    const formData = new FormData()
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
    formData.append('file', blob, `recording.${ext}`)
    formData.append('history', JSON.stringify(history.current))

    try {
      const res = await fetch(`${API_URL}/voice`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Request failed')
      }

      const data = await res.json()
      setTranscript(data.transcript)
      setReply(data.reply)

      if (data.language) {
        langRef.current = data.language
        setDetectedLang(data.language)
      }

      history.current.push(
        { role: 'user', content: data.transcript },
        { role: 'assistant', content: data.reply }
      )
      if (history.current.length > MAX_HISTORY) {
        history.current = history.current.slice(-MAX_HISTORY)
      }

      speakReply(data.reply)
    } catch (err) {
      setError(err.message)
      setStatus(isConversingRef.current ? 'Listening...' : 'Ready')
    }
  }, [speakReply])

  const stopRecording = useCallback(() => {
    stopSilenceDetection()
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop()
      setIsRecording(false)
    }
  }, [stopSilenceDetection])

  const startSilenceDetection = useCallback((stream) => {
    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)

    audioContextRef.current = audioContext

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    let silentSince = null

    const check = () => {
      analyser.getByteFrequencyData(dataArray)
      const average = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length

      if (average < SILENCE_THRESHOLD) {
        if (!silentSince) silentSince = Date.now()
        if (Date.now() - silentSince > SILENCE_DURATION) {
          stopRecording()
          return
        }
      } else {
        silentSince = null
      }

      silenceCheckRef.current = requestAnimationFrame(check)
    }

    silenceCheckRef.current = requestAnimationFrame(check)
  }, [stopRecording])

  const startRecording = useCallback(async () => {
    window.speechSynthesis.cancel()
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})

      audioChunks.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunks.current, { type: recorder.mimeType })
        handleAudioReady(blob)
      }

      recorder.start()
      mediaRecorder.current = recorder
      setIsRecording(true)
      setStatus('Listening...')

      if (!isPTT) {
        startSilenceDetection(stream)
      }
    } catch (err) {
      setError('Microphone access denied')
      setStatus('Ready')
    }
  }, [handleAudioReady, startSilenceDetection, isPTT])

  const startConversation = useCallback(() => {
    isConversingRef.current = true
    setIsConversing(true)
    startRecording()
  }, [startRecording])

  const stopConversation = useCallback(() => {
    isConversingRef.current = false
    setIsConversing(false)
    window.speechSynthesis.cancel()
    stopSilenceDetection()
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop()
    }
    setIsRecording(false)
    setStatus('Ready')
  }, [stopSilenceDetection])

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev
      isMutedRef.current = next
      if (next) {
        stopSilenceDetection()
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
          mediaRecorder.current.stop()
        }
        setIsRecording(false)
        setStatus('Muted')
      } else if (isConversingRef.current) {
        startRecording()
      }
      return next
    })
  }, [stopSilenceDetection, startRecording])

  const clearHistory = useCallback(() => {
    history.current = []
    setTranscript('')
    setReply('')
    setError(null)
    setDetectedLang(null)
    langRef.current = null
  }, [])

  return (
    <div className="app">
      <h1 className="title">KoskiPlex</h1>
      <p className="subtitle">Voice AI — Powered by Groq</p>

      <p className="status">{status}</p>
      {detectedLang && <p className="lang-badge">{detectedLang}</p>}

      {isPTT ? (
        <button
          className={`ptt-button ${isRecording ? 'recording' : ''}`}
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={(e) => { e.preventDefault(); startRecording() }}
          onTouchEnd={(e) => { e.preventDefault(); stopRecording() }}
        >
          {isRecording ? '🎙 Release to Send' : '🎤 Hold to Talk'}
        </button>
      ) : (
        <button
          className={`ptt-button ${isConversing ? (isRecording ? 'recording' : 'conversing') : ''}`}
          onClick={isConversing ? stopConversation : startConversation}
        >
          {isConversing
            ? (isRecording ? '🎙 Listening...' : '⏳ Processing...')
            : '🎤 Start Conversation'
          }
        </button>
      )}

      <div className="controls">
        {isConversing && !isPTT && (
          <button
            className={`mute-btn ${isMuted ? 'muted' : ''}`}
            onClick={toggleMute}
          >
            {isMuted ? '🔇 Unmute' : '🔊 Mute'}
          </button>
        )}
        <label className="toggle">
          <input
            type="checkbox"
            checked={isPTT}
            onChange={() => {
              if (isConversing) stopConversation()
              setIsPTT((p) => !p)
            }}
          />
          Push-to-Talk
        </label>
        <button className="clear-btn" onClick={clearHistory}>
          Clear
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="conversation">
        {transcript && (
          <div className="message user-msg">
            <span className="label">You:</span> {transcript}
          </div>
        )}
        {reply && (
          <div className="message ai-msg">
            <span className="label">KoskiPlex:</span> {reply}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
