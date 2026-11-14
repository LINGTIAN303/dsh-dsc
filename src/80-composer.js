/** 输入框：自增高文本域、深度思考 / 智能搜索开关、附件、录音、发送与停止 */
function Composer({ session, onOpenSettings }) {
  useLocaleRevision()
  const streaming = useStore(active, (state) => state.streaming)
  const prefs = useStore(settings, (state) => state)
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(0)
  const [recording, setRecording] = useState(null)
  const [transcribing, setTranscribing] = useState(false)
  const [level, setLevel] = useState(0)
  const textareaRef = useRef(null)
  const mirrorRef = useRef(null)
  const fileRef = useRef(null)
  const recorderRef = useRef(null)
  const levelTimer = useRef(null)

  const home = session.messages.length === 0
  const canSend = (text.trim() !== '' || files.length > 0) && !streaming && uploading === 0

  // 自增高：镜像元素决定高度，文本域跟随
  useEffect(() => {
    const mirror = mirrorRef.current
    const textarea = textareaRef.current
    if (mirror === null || textarea === null) return
    textarea.style.height = `${mirror.scrollHeight}px`
  }, [text])

  useEffect(
    () => () => {
      if (levelTimer.current !== null) clearInterval(levelTimer.current)
      recorderRef.current?.cancel()
      stopReadAloud()
    },
    [],
  )

  const submit = async () => {
    if (!canSend) return
    const content = text.trim()
    setText('')
    const ready = files
    setFiles([])
    await sendMessage(session, content, ready)
  }

  const onKeyDown = (event) => {
    // 与官方一致：Enter 发送，Shift+Enter 换行；输入法组合中不拦
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  const pickFiles = async (event) => {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    await uploadFiles(picked)
  }

  const uploadFiles = async (picked) => {
    if (picked.length === 0) return
    setUploading((count) => count + picked.length)
    for (const file of picked) {
      const placeholderId = newId()
      const image = isImageFile(file)
      // 预览地址只留在内存里，不进会话文件
      if (image) rememberPreview(placeholderId, URL.createObjectURL(file))
      const placeholder = {
        id: placeholderId,
        serverId: null,
        name: file.name,
        size: file.size,
        isImage: image,
        mimeType: file.type,
        busy: true,
      }
      setFiles((list) => [...list, placeholder])
      try {
        const uploaded = await attachFile(file)
        // 服务端返回的附件 id 与占位 id 不同，把预览一并转过去
        rememberPreview(uploaded.id, previewOf(placeholderId))
        setFiles((list) => list.map((item) => (item.id === placeholderId ? uploaded : item)))
      } catch (error) {
        showToast(`${file.name}: ${error.message}`)
        setFiles((list) => list.filter((item) => item.id !== placeholderId))
      } finally {
        setUploading((count) => Math.max(0, count - 1))
      }
    }
  }

  const removeFile = (id) => {
    setFiles((list) => list.filter((item) => item.id !== id))
  }

  /** 结束录音并转写；按钮与到时自动收尾共用这一条路径 */
  const finishRecording = async () => {
    const recorder = recorderRef.current
    if (recorder === null) return
    recorderRef.current = null
    if (levelTimer.current !== null) {
      clearInterval(levelTimer.current)
      levelTimer.current = null
    }
    setRecording(null)
    setLevel(0)
    setTranscribing(true)
    try {
      const wav = await recorder.stop()
      if (wav !== null) {
        const text = await transcribe(wav)
        if (text.trim() !== '') setText((current) => (current === '' ? text : `${current} ${text}`))
      }
    } catch (error) {
      showToast(error.message)
    } finally {
      setTranscribing(false)
      textareaRef.current?.focus()
    }
  }

  const toggleRecording = async () => {
    if (recording !== null) {
      await finishRecording()
      return
    }
    try {
      const recorder = await new Recorder().start({
        // 用户可能在设置里指定了真实麦克风，避免录到系统默认的虚拟声卡
        deviceId: readPreferredMic(),
        // 到 ASR 的 120 秒上限时自动收尾并转写，而不是让请求注定被拒
        onLimit: () => {
          showToast(T('recordingLimit'))
          void finishRecording()
        },
      })
      recorderRef.current = recorder
      setRecording({ startedAt: Date.now() })
      levelTimer.current = setInterval(() => setLevel(recorder.level()), 100)
    } catch (error) {
      showToast(error?.name === 'NotAllowedError' ? '需要麦克风权限才能语音输入' : error.message)
    }
  }

  const onDrop = async (event) => {
    event.preventDefault()
    const dropped = Array.from(event.dataTransfer?.files ?? [])
    await uploadFiles(dropped)
  }

  return h('div', { className: 'dsa-composer-wrap', 'data-home': home ? 'true' : 'false' },
    h('div', { className: 'dsa-composer-inner' },
    h('div', {
      className: 'dsa-composer',
      'data-home': home ? 'true' : 'false',
      onClick: (event) => {
        if (event.target === event.currentTarget) textareaRef.current?.focus()
      },
      onDragOver: (event) => event.preventDefault(),
      onDrop,
    },
      files.length > 0 &&
        h('div', { className: 'dsa-attachments' },
          files.map((file) => {
            const url = previewOf(file.id)
            return h('div', { key: file.id, className: 'dsa-attachment', title: file.name },
              file.isImage && url !== undefined
                ? h('img', { src: url, alt: file.name })
                : h('div', { className: 'dsa-attachment-name' }, file.name),
              file.busy === true && h('div', { className: 'dsa-attachment-busy' }),
              h('button', {
                type: 'button',
                className: 'dsa-attachment-remove',
                'aria-label': T('close'),
                onClick: (event) => {
                  event.stopPropagation()
                  removeFile(file.id)
                },
              }, h(IconCloseFill14)),
            )
          }),
        ),

      h('div', { className: 'dsa-textarea-wrap' },
        recording !== null
          ? h(React.Fragment, null,
              h(Spectrum, { getAnalyser: () => recorderRef.current?.analyser() ?? null }),
              h('span', { className: 'dsa-recording-tip' }, T('recording')),
            )
          : null,
        h('textarea', {
          ref: textareaRef,
          className: 'dsa-textarea',
          style: recording !== null ? { visibility: 'hidden' } : undefined,
          value: text,
          placeholder: T('placeholder'),
          rows: 1,
          onChange: (event) => setText(event.target.value),
          onKeyDown,
          onPaste: async (event) => {
            const pasted = Array.from(event.clipboardData?.files ?? [])
            if (pasted.length > 0) await uploadFiles(pasted)
          },
        }),
        h('textarea', {
          ref: mirrorRef,
          className: 'dsa-textarea-mirror',
          value: text === '' ? T('placeholder') : text,
          readOnly: true,
          tabIndex: -1,
          rows: 1,
        }),
      ),

      h('div', { className: 'dsa-function-row' },
        h('div', { className: 'dsa-toggles' },
          h('button', {
            type: 'button',
            className: 'dsa-toggle',
            'data-selected': prefs.thinking ? 'true' : 'false',
            'aria-pressed': prefs.thinking ? 'true' : 'false',
            onClick: () => settings.set((state) => ({ ...state, thinking: !state.thinking })),
            title: T('thinking'),
          }, h(IconThinkOutline16), T('thinking')),
          h('button', {
            type: 'button',
            className: 'dsa-toggle',
            'data-selected': prefs.search ? 'true' : 'false',
            'aria-pressed': prefs.search ? 'true' : 'false',
            onClick: () => settings.set((state) => ({ ...state, search: !state.search })),
            title: T('search'),
          }, h(IconSearchOutline16), T('search')),
        ),

        h('div', { className: 'dsa-composer-right' },
          h('input', {
            ref: fileRef,
            type: 'file',
            multiple: true,
            style: { display: 'none' },
            onChange: pickFiles,
          }),
          h('button', {
            type: 'button',
            className: 'dsa-icon-button',
            title: T('attach'),
            'aria-label': T('attach'),
            onClick: () => fileRef.current?.click(),
          }, h(IconPaperclipOutline16)),
          h('button', {
            type: 'button',
            className: recording !== null ? 'dsa-mic-active' : 'dsa-icon-button',
            title: T('voiceInput'),
            'aria-label': T('voiceInput'),
            'aria-pressed': recording !== null ? 'true' : 'false',
            disabled: transcribing || streaming,
            onClick: toggleRecording,
          },
            transcribing
              ? h('span', { className: 'dsa-transcribing' })
              : recording !== null
                ? h(React.Fragment, null,
                    h('span', { className: 'dsa-mic-halo' }),
                    h('span', { className: 'dsa-mic-core' }),
                    h('span', { className: 'dsa-mic-glyph' }, h(IconMicFill16)),
                  )
                : h(IconMicOutline16),
          ),
          h('button', {
            type: 'button',
            className: 'dsa-send',
            'data-mode': streaming ? 'stop' : 'send',
            disabled: !streaming && !canSend,
            title: streaming ? T('stop') : T('send'),
            'aria-label': streaming ? T('stop') : T('send'),
            onClick: () => {
              if (streaming) stopStreaming()
              else void submit()
            },
          }, streaming ? h(IconStopFill16) : h(IconSendOutline16)),
        ),
      ),
    ),
    h('div', { className: 'dsa-caveat' }, T('welcomeTip')),
    ),
  )
}
