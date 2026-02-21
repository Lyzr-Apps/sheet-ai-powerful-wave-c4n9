'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  FiHome, FiGrid, FiSettings, FiPlay, FiRefreshCw,
  FiCheck, FiX, FiAlertTriangle, FiHelpCircle, FiSend,
  FiEye, FiEyeOff, FiClock, FiActivity,
  FiChevronDown, FiChevronUp, FiLoader, FiArrowRight,
  FiZap, FiTable, FiFileText, FiLink, FiType, FiList,
  FiTrash2, FiCopy
} from 'react-icons/fi'
import { copyToClipboard } from '@/lib/clipboard'

// --- Constants ---
const ROW_AGENT_ID = '699936cd02de7ae3dd4c1a80'
const ADVISOR_AGENT_ID = '699936cdcfb4f05aa49ea783'

const SAMPLE_ACTIVITY_LOG = [
  { id: '1', timestamp: '2024-01-24 14:32', lines: 10, success: 8, failed: 2, instruction: 'Classify sentiment as positive/negative/neutral' },
  { id: '2', timestamp: '2024-01-23 09:15', lines: 5, success: 5, failed: 0, instruction: 'Summarize each item in one sentence' },
  { id: '3', timestamp: '2024-01-22 16:45', lines: 8, success: 7, failed: 1, instruction: 'Translate to formal English' },
]

// --- Interfaces ---
interface ProcessingState {
  isRunning: boolean
  currentLine: number
  totalLines: number
  successCount: number
  failCount: number
  retryCount: number
  completed: boolean
}

interface LineResult {
  lineNumber: number
  input: string
  output: string
  status: 'pending' | 'processing' | 'success' | 'error'
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  suggestedAction?: string
  relatedTopics?: string
}

interface ActivityEntry {
  id: string
  timestamp: string
  lines: number
  success: number
  failed: number
  instruction: string
}

interface ConfigState {
  apiKey: string
  endpoint: string
  model: string
  isConfigured: boolean
}

// --- Markdown Renderer ---
function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      part
    )
  )
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

// --- Error Boundary ---
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// --- Sidebar ---
function Sidebar({ activeScreen, setActiveScreen }: { activeScreen: string; setActiveScreen: (s: string) => void }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: FiHome },
    { id: 'processing', label: 'Processing', icon: FiGrid },
    { id: 'settings', label: 'Settings', icon: FiSettings },
  ]

  return (
    <div className="w-64 min-h-screen bg-card border-r border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <FiType className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">Text Processor</h1>
            <p className="text-xs text-muted-foreground">AI Batch Processing</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeScreen === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveScreen(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive ? 'bg-primary/15 text-primary shadow-lg shadow-primary/10' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          )
        })}
      </nav>
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2 px-4 py-2">
          <FiZap className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs text-muted-foreground">Powered by Lyzr AI</span>
        </div>
      </div>
    </div>
  )
}

// --- Dashboard Screen ---
function DashboardScreen({
  showSample,
  activityLog,
  lastRun,
  setActiveScreen,
}: {
  showSample: boolean
  activityLog: ActivityEntry[]
  lastRun: { lines: number; success: number; failed: number; timestamp: string } | null
  setActiveScreen: (s: string) => void
}) {
  const displayLog = showSample ? SAMPLE_ACTIVITY_LOG : activityLog
  const displayRun = showSample
    ? { lines: 10, success: 8, failed: 2, timestamp: 'Jan 24, 2024 at 14:32' }
    : lastRun

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">Overview of your text processing activity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* How It Works */}
        <Card className="bg-card border-border shadow-xl shadow-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FiFileText className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">How It Works</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3">
              {[
                { step: '1', text: 'Paste your text -- each line is a separate item' },
                { step: '2', text: 'Write a processing instruction (applied to every line)' },
                { step: '3', text: 'Click Run -- AI processes each line independently' },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-primary">{item.step}</span>
                  </div>
                  <p className="text-sm text-foreground">{item.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Last Run Summary */}
        <Card className="bg-card border-border shadow-xl shadow-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FiActivity className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Last Processing Run</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {displayRun ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Lines Processed</p>
                    <p className="text-2xl font-bold text-foreground">{displayRun.lines}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Success Rate</p>
                    <p className="text-2xl font-bold" style={{ color: 'hsl(135, 94%, 60%)' }}>
                      {displayRun.lines > 0 ? Math.round((displayRun.success / displayRun.lines) * 100) : 0}%
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Successful</p>
                    <Badge variant="outline" className="border-green-500/30 text-green-400">{displayRun.success} passed</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Failed</p>
                    <Badge variant="outline" className="border-red-500/30 text-red-400">{displayRun.failed} failed</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
                  <FiClock className="w-3 h-3" />
                  <span>{displayRun.timestamp}</span>
                </div>
              </>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <FiActivity className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No processing runs yet</p>
                <p className="text-xs mt-1">Run your first batch in Processing</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Log */}
      <Card className="bg-card border-border shadow-xl shadow-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiClock className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </div>
            {displayLog.length > 0 && (
              <Badge variant="secondary" className="text-xs">{displayLog.length} runs</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {displayLog.length > 0 ? (
            <ScrollArea className="h-52">
              <div className="space-y-3">
                {displayLog.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-border/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{entry.instruction}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <FiClock className="w-3 h-3" /> {entry.timestamp}
                        </span>
                        <span className="text-xs text-muted-foreground">{entry.lines} lines</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">{entry.success} ok</Badge>
                      {entry.failed > 0 && (
                        <Badge variant="outline" className="text-xs border-red-500/30 text-red-400">{entry.failed} err</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FiFileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No activity recorded</p>
              <p className="text-xs mt-1">Toggle sample data or run processing</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Action */}
      <Button onClick={() => setActiveScreen('processing')} className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all duration-200">
        <FiArrowRight className="w-4 h-4 mr-2" />
        Go to Processing
      </Button>
    </div>
  )
}

// --- Processing Screen ---
function ProcessingScreen({
  processingState,
  setProcessingState,
  activityLog,
  setActivityLog,
  showSample,
  activeAgentId,
  setActiveAgentId,
  setLastRun,
}: {
  processingState: ProcessingState
  setProcessingState: React.Dispatch<React.SetStateAction<ProcessingState>>
  activityLog: ActivityEntry[]
  setActivityLog: React.Dispatch<React.SetStateAction<ActivityEntry[]>>
  showSample: boolean
  activeAgentId: string | null
  setActiveAgentId: React.Dispatch<React.SetStateAction<string | null>>
  setLastRun: React.Dispatch<React.SetStateAction<{ lines: number; success: number; failed: number; timestamp: string } | null>>
}) {
  const [instruction, setInstruction] = useState('')
  const [inputText, setInputText] = useState('')
  const [results, setResults] = useState<LineResult[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info' | ''>('')
  const abortRef = useRef(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  // Parse lines from input text
  const parsedLines = inputText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  // Load sample data
  useEffect(() => {
    if (showSample) {
      setInstruction('Classify the sentiment as positive, negative, or neutral')
      setInputText(
        'Great product, fast shipping\nItem arrived damaged, poor packaging\nAverage quality, nothing special\nExcellent customer service response\nProduct does not match description'
      )
      setResults([
        { lineNumber: 1, input: 'Great product, fast shipping', output: 'Positive - customer expresses satisfaction with both product quality and delivery speed', status: 'success' },
        { lineNumber: 2, input: 'Item arrived damaged, poor packaging', output: 'Negative - customer reports damage and criticizes packaging quality', status: 'success' },
        { lineNumber: 3, input: 'Average quality, nothing special', output: 'Neutral - customer finds the product unremarkable without strong feelings', status: 'success' },
        { lineNumber: 4, input: 'Excellent customer service response', output: 'Positive - customer appreciates the support team interaction', status: 'success' },
        { lineNumber: 5, input: 'Product does not match description', output: 'Error: rate limit exceeded', status: 'error' },
      ])
      setProcessingState({
        isRunning: false,
        currentLine: 5,
        totalLines: 5,
        successCount: 4,
        failCount: 1,
        retryCount: 1,
        completed: true,
      })
    } else {
      setResults([])
      setProcessingState({
        isRunning: false,
        currentLine: 0,
        totalLines: 0,
        successCount: 0,
        failCount: 0,
        retryCount: 0,
        completed: false,
      })
    }
  }, [showSample, setProcessingState])

  const handleRunProcessing = useCallback(async () => {
    if (!instruction.trim()) {
      setStatusMessage('Please enter a processing instruction.')
      setStatusType('error')
      return
    }
    if (parsedLines.length === 0) {
      setStatusMessage('Please enter at least one line of text to process.')
      setStatusType('error')
      return
    }

    const totalLines = parsedLines.length

    // Initialize results as pending
    const initialResults: LineResult[] = parsedLines.map((line, idx) => ({
      lineNumber: idx + 1,
      input: line,
      output: '',
      status: 'pending' as const,
    }))
    setResults(initialResults)

    setProcessingState({
      isRunning: true,
      currentLine: 0,
      totalLines,
      successCount: 0,
      failCount: 0,
      retryCount: 0,
      completed: false,
    })
    setStatusMessage('')
    setStatusType('')
    abortRef.current = false

    let successCount = 0
    let failCount = 0
    let retryTotal = 0

    for (let i = 0; i < totalLines; i++) {
      if (abortRef.current) break

      const lineText = parsedLines[i]

      // Mark current line as processing
      setResults(prev => prev.map((r, idx) =>
        idx === i ? { ...r, status: 'processing' as const } : r
      ))

      const message = `Instruction: ${instruction}\n\nText to process:\n${lineText}`

      let attempts = 0
      let succeeded = false
      const maxAttempts = 3

      while (attempts < maxAttempts && !succeeded && !abortRef.current) {
        if (attempts > 0) {
          retryTotal++
          setProcessingState(prev => ({ ...prev, retryCount: retryTotal }))
          await new Promise(r => setTimeout(r, attempts * 1000))
        }
        attempts++

        try {
          setActiveAgentId(ROW_AGENT_ID)
          const result = await callAIAgent(message, ROW_AGENT_ID)
          setActiveAgentId(null)

          const outputText = result?.response?.result?.output_text ?? ''
          const agentStatus = result?.response?.result?.status ?? ''
          const errorMsg = result?.response?.result?.error_message ?? ''

          if (result?.success && agentStatus !== 'error') {
            succeeded = true
            successCount++
            setResults(prev => prev.map((r, idx) =>
              idx === i ? { ...r, output: outputText || 'Processed', status: 'success' as const } : r
            ))
          } else {
            if (attempts >= maxAttempts) {
              failCount++
              setResults(prev => prev.map((r, idx) =>
                idx === i ? { ...r, output: errorMsg || result?.error || 'Failed', status: 'error' as const } : r
              ))
            }
          }
        } catch {
          if (attempts >= maxAttempts) {
            failCount++
            setResults(prev => prev.map((r, idx) =>
              idx === i ? { ...r, output: 'Network error', status: 'error' as const } : r
            ))
          }
        }
      }

      setProcessingState(prev => ({
        ...prev,
        currentLine: i + 1,
        successCount,
        failCount,
        retryCount: retryTotal,
      }))
    }

    setProcessingState(prev => ({
      ...prev,
      isRunning: false,
      completed: true,
      successCount,
      failCount,
    }))

    const logEntry: ActivityEntry = {
      id: String(Date.now()),
      timestamp: new Date().toLocaleString(),
      lines: totalLines,
      success: successCount,
      failed: failCount,
      instruction: instruction.slice(0, 80),
    }
    setActivityLog(prev => [logEntry, ...prev])
    setLastRun({
      lines: totalLines,
      success: successCount,
      failed: failCount,
      timestamp: new Date().toLocaleString(),
    })

    if (failCount === 0) {
      setStatusMessage(`All ${totalLines} lines processed successfully!`)
      setStatusType('success')
    } else {
      setStatusMessage(`Completed: ${successCount} succeeded, ${failCount} failed.`)
      setStatusType('error')
    }
    setActiveAgentId(null)
  }, [instruction, parsedLines, setProcessingState, setActivityLog, setActiveAgentId, setLastRun])

  const handleRetryFailed = useCallback(async () => {
    const failedIndices: number[] = []
    results.forEach((r, idx) => {
      if (r.status === 'error') failedIndices.push(idx)
    })
    if (failedIndices.length === 0) {
      setStatusMessage('No failed lines to retry.')
      setStatusType('info')
      return
    }

    setProcessingState({
      isRunning: true,
      currentLine: 0,
      totalLines: failedIndices.length,
      successCount: 0,
      failCount: 0,
      retryCount: 0,
      completed: false,
    })
    setStatusMessage('')
    setStatusType('')

    let successCount = 0
    let failCount = 0

    for (let fi = 0; fi < failedIndices.length; fi++) {
      const i = failedIndices[fi]
      const lineText = results[i]?.input
      if (!lineText) continue

      setResults(prev => prev.map((r, idx) =>
        idx === i ? { ...r, status: 'processing' as const } : r
      ))

      const message = `Instruction: ${instruction}\n\nText to process:\n${lineText}`

      try {
        setActiveAgentId(ROW_AGENT_ID)
        const result = await callAIAgent(message, ROW_AGENT_ID)
        setActiveAgentId(null)
        const outputText = result?.response?.result?.output_text ?? ''
        const agentStatus = result?.response?.result?.status ?? ''

        if (result?.success && agentStatus !== 'error') {
          successCount++
          setResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, output: outputText || 'Processed', status: 'success' as const } : r
          ))
        } else {
          failCount++
          setResults(prev => prev.map((r, idx) =>
            idx === i ? { ...r, status: 'error' as const } : r
          ))
        }
      } catch {
        failCount++
        setResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, status: 'error' as const } : r
        ))
      }

      setProcessingState(prev => ({
        ...prev,
        currentLine: fi + 1,
        successCount,
        failCount,
      }))
    }

    setProcessingState(prev => ({
      ...prev,
      isRunning: false,
      completed: true,
      successCount,
      failCount,
    }))

    setStatusMessage(failCount === 0 ? 'All retries succeeded!' : `Retry: ${successCount} ok, ${failCount} still failing.`)
    setStatusType(failCount === 0 ? 'success' : 'error')
    setActiveAgentId(null)
  }, [results, instruction, setProcessingState, setActiveAgentId])

  const handleClearResults = useCallback(() => {
    setResults([])
    setProcessingState({
      isRunning: false,
      currentLine: 0,
      totalLines: 0,
      successCount: 0,
      failCount: 0,
      retryCount: 0,
      completed: false,
    })
    setStatusMessage('')
    setStatusType('')
  }, [setProcessingState])

  const handleCopyOutput = useCallback(async (text: string, idx: number) => {
    await copyToClipboard(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 1500)
  }, [])

  const handleCopyAllOutputs = useCallback(async () => {
    const allOutputs = results
      .filter(r => r.status === 'success')
      .map(r => r.output)
      .join('\n')
    await copyToClipboard(allOutputs)
    setCopiedIdx(-1)
    setTimeout(() => setCopiedIdx(null), 1500)
  }, [results])

  const progressPercent = processingState.totalLines > 0
    ? Math.round((processingState.currentLine / processingState.totalLines) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Processing</h2>
        <p className="text-sm text-muted-foreground mt-1">Enter text (one item per line), write an instruction, and run batch AI processing</p>
      </div>

      {/* Instruction */}
      <Card className="bg-card border-border shadow-xl shadow-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiZap className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Processing Instruction</CardTitle>
            </div>
            <span className={`text-xs ${instruction.length > 500 ? 'text-red-400' : 'text-muted-foreground'}`}>
              {instruction.length}/500
            </span>
          </div>
          <CardDescription className="text-muted-foreground text-xs">
            This instruction will be applied to each line independently
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="e.g., Classify the sentiment as positive, negative, or neutral..."
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={2}
            className="bg-secondary border-border resize-none"
            disabled={processingState.isRunning}
          />
        </CardContent>
      </Card>

      {/* Text Input */}
      <Card className="bg-card border-border shadow-xl shadow-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiList className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Input Text</CardTitle>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-xs">
                {parsedLines.length} {parsedLines.length === 1 ? 'line' : 'lines'} detected
              </Badge>
              {inputText.length > 0 && !processingState.isRunning && (
                <button
                  onClick={() => setInputText('')}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <FiTrash2 className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
          </div>
          <CardDescription className="text-muted-foreground text-xs">
            Paste or type your text below. Each line is treated as a separate item to process.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={"Great product, fast shipping\nItem arrived damaged, poor packaging\nAverage quality, nothing special\nExcellent customer service\nProduct does not match description"}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={8}
            className="bg-secondary border-border font-mono text-sm leading-relaxed"
            disabled={processingState.isRunning}
          />
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={handleRunProcessing}
          disabled={processingState.isRunning || !instruction.trim() || parsedLines.length === 0}
          className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all duration-200"
        >
          {processingState.isRunning ? (
            <>
              <FiLoader className="w-4 h-4 mr-2 animate-spin" />
              Processing line {processingState.currentLine} of {processingState.totalLines}...
            </>
          ) : (
            <>
              <FiPlay className="w-4 h-4 mr-2" />
              Run Processing ({parsedLines.length} {parsedLines.length === 1 ? 'line' : 'lines'})
            </>
          )}
        </Button>

        {processingState.completed && processingState.failCount > 0 && (
          <Button
            onClick={handleRetryFailed}
            disabled={processingState.isRunning}
            variant="outline"
            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            <FiRefreshCw className="w-4 h-4 mr-2" />
            Retry Failed ({processingState.failCount})
          </Button>
        )}

        {processingState.isRunning && (
          <Button
            onClick={() => { abortRef.current = true }}
            variant="outline"
            className="border-destructive/30 text-destructive hover:bg-destructive/10"
          >
            <FiX className="w-4 h-4 mr-2" />
            Stop
          </Button>
        )}

        {results.length > 0 && !processingState.isRunning && (
          <Button
            onClick={handleClearResults}
            variant="outline"
            className="border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            <FiTrash2 className="w-4 h-4 mr-2" />
            Clear Results
          </Button>
        )}
      </div>

      {/* Progress Panel */}
      {(processingState.isRunning || processingState.completed) && (
        <Card className="bg-card border-border shadow-xl shadow-primary/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {processingState.isRunning ? `Processing line ${processingState.currentLine} of ${processingState.totalLines}` : 'Processing complete'}
              </span>
              <span className="text-sm font-bold text-primary">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1" style={{ color: 'hsl(135, 94%, 60%)' }}>
                <FiCheck className="w-3 h-3" /> {processingState.successCount} success
              </span>
              <span className="flex items-center gap-1" style={{ color: 'hsl(0, 100%, 62%)' }}>
                <FiX className="w-3 h-3" /> {processingState.failCount} failed
              </span>
              {processingState.retryCount > 0 && (
                <span className="flex items-center gap-1" style={{ color: 'hsl(326, 100%, 68%)' }}>
                  <FiRefreshCw className="w-3 h-3" /> {processingState.retryCount} retries
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <Card className="bg-card border-border shadow-xl shadow-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FiTable className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Results</CardTitle>
                <Badge variant="secondary" className="text-xs">{results.length} lines</Badge>
              </div>
              {results.some(r => r.status === 'success') && (
                <Button
                  onClick={handleCopyAllOutputs}
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
                >
                  {copiedIdx === -1 ? <FiCheck className="w-3 h-3" /> : <FiCopy className="w-3 h-3" />}
                  {copiedIdx === -1 ? 'Copied!' : 'Copy All Outputs'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[28rem]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16">#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Input</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Output</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-b border-border/40 hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{row.lineNumber}</td>
                        <td className="px-4 py-3 text-sm text-foreground max-w-[250px]">
                          <div className="truncate" title={row.input}>{row.input}</div>
                        </td>
                        <td className="px-4 py-3 text-sm max-w-[350px]">
                          {row.status === 'processing' ? (
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <FiLoader className="w-3 h-3 animate-spin text-primary" />
                              Processing...
                            </span>
                          ) : row.status === 'pending' ? (
                            <span className="text-muted-foreground/60">Waiting...</span>
                          ) : (
                            <div className={`${row.status === 'error' ? 'text-red-400' : 'text-foreground'}`} title={row.output}>
                              {row.output}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.status === 'success' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'hsla(135, 94%, 60%, 0.15)', color: 'hsl(135, 94%, 60%)' }}>
                              <FiCheck className="w-3 h-3" /> OK
                            </span>
                          ) : row.status === 'error' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'hsla(0, 100%, 62%, 0.15)', color: 'hsl(0, 100%, 62%)' }}>
                              <FiX className="w-3 h-3" /> Fail
                            </span>
                          ) : row.status === 'processing' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'hsla(265, 89%, 72%, 0.15)', color: 'hsl(265, 89%, 72%)' }}>
                              <FiLoader className="w-3 h-3 animate-spin" /> ...
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.status === 'success' && (
                            <button
                              onClick={() => handleCopyOutput(row.output, rowIdx)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title="Copy output"
                            >
                              {copiedIdx === rowIdx ? <FiCheck className="w-3.5 h-3.5" style={{ color: 'hsl(135, 94%, 60%)' }} /> : <FiCopy className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Status Message */}
      {statusMessage && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${statusType === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : statusType === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
          {statusType === 'success' ? <FiCheck className="w-4 h-4 flex-shrink-0" /> : statusType === 'error' ? <FiAlertTriangle className="w-4 h-4 flex-shrink-0" /> : <FiActivity className="w-4 h-4 flex-shrink-0" />}
          {statusMessage}
        </div>
      )}
    </div>
  )
}

// --- Settings Screen ---
function SettingsScreen({
  config,
  setConfig,
  activeAgentId,
  setActiveAgentId,
}: {
  config: ConfigState
  setConfig: React.Dispatch<React.SetStateAction<ConfigState>>
  activeAgentId: string | null
  setActiveAgentId: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const [showPassword, setShowPassword] = useState(false)
  const [testStatus, setTestStatus] = useState<{ message: string; type: 'success' | 'error' | '' }>({ message: '', type: '' })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  // Chat state
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('spreadsheet_api_key') ?? ''
      const savedEndpoint = localStorage.getItem('spreadsheet_endpoint') ?? ''
      const savedModel = localStorage.getItem('spreadsheet_model') ?? ''
      if (savedKey || savedEndpoint || savedModel) {
        setConfig({
          apiKey: savedKey,
          endpoint: savedEndpoint,
          model: savedModel,
          isConfigured: !!savedKey,
        })
      }
    }
  }, [setConfig])

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chatMessages])

  const handleSave = useCallback(() => {
    setSaving(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem('spreadsheet_api_key', config.apiKey)
      localStorage.setItem('spreadsheet_endpoint', config.endpoint)
      localStorage.setItem('spreadsheet_model', config.model)
    }
    setConfig(prev => ({ ...prev, isConfigured: !!prev.apiKey }))
    setTimeout(() => {
      setSaving(false)
      setTestStatus({ message: 'Configuration saved successfully.', type: 'success' })
    }, 400)
  }, [config, setConfig])

  const handleTest = useCallback(async () => {
    setTesting(true)
    setTestStatus({ message: '', type: '' })
    try {
      setActiveAgentId(ADVISOR_AGENT_ID)
      const result = await callAIAgent('Test connection: confirm you are available and working.', ADVISOR_AGENT_ID)
      setActiveAgentId(null)
      if (result?.success) {
        setTestStatus({ message: 'Connection test successful! Agent responded.', type: 'success' })
      } else {
        setTestStatus({ message: result?.error || 'Connection test failed.', type: 'error' })
      }
    } catch {
      setTestStatus({ message: 'Connection test failed: network error.', type: 'error' })
    }
    setTesting(false)
    setActiveAgentId(null)
  }, [setActiveAgentId])

  const handleChatSend = useCallback(async () => {
    const msg = chatInput.trim()
    if (!msg) return
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: msg }])
    setChatLoading(true)

    try {
      setActiveAgentId(ADVISOR_AGENT_ID)
      const result = await callAIAgent(msg, ADVISOR_AGENT_ID)
      setActiveAgentId(null)
      const advice = result?.response?.result?.advice ?? result?.response?.result?.text ?? result?.response?.message ?? 'No response received.'
      const suggestedAction = result?.response?.result?.suggested_action ?? ''
      const relatedTopics = result?.response?.result?.related_topics ?? ''

      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: advice,
        suggestedAction,
        relatedTopics,
      }])
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.' }])
    }
    setChatLoading(false)
    setActiveAgentId(null)
  }, [chatInput, setActiveAgentId])

  const handleChatKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleChatSend()
    }
  }, [handleChatSend])

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Configure your LLM provider and get setup help</p>
      </div>

      {/* Configuration Form */}
      <Card className="bg-card border-border shadow-xl shadow-primary/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FiSettings className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">LLM Provider Configuration</CardTitle>
          </div>
          <CardDescription className="text-muted-foreground text-xs">Stored locally in your browser</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="api-key" className="text-sm font-medium">API Key</Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showPassword ? 'text' : 'password'}
                placeholder="sk-..."
                value={config.apiKey}
                onChange={(e) => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                className="bg-secondary border-border pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="endpoint" className="text-sm font-medium">Endpoint URL</Label>
            <Input
              id="endpoint"
              type="text"
              placeholder="https://api.provider.com/v1/chat/completions"
              value={config.endpoint}
              onChange={(e) => setConfig(prev => ({ ...prev, endpoint: e.target.value }))}
              className="bg-secondary border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model" className="text-sm font-medium">Model Name</Label>
            <Input
              id="model"
              type="text"
              placeholder="gpt-4"
              value={config.model}
              onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
              className="bg-secondary border-border"
            />
          </div>

          <Separator className="bg-border" />

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
            >
              {saving ? <FiLoader className="w-4 h-4 mr-2 animate-spin" /> : <FiCheck className="w-4 h-4 mr-2" />}
              Save Configuration
            </Button>
            <Button
              onClick={handleTest}
              disabled={testing}
              variant="outline"
              className="border-border text-foreground hover:bg-secondary"
            >
              {testing ? <FiLoader className="w-4 h-4 mr-2 animate-spin" /> : <FiLink className="w-4 h-4 mr-2" />}
              Test Connection
            </Button>
          </div>

          {testStatus.message && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${testStatus.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {testStatus.type === 'success' ? <FiCheck className="w-4 h-4 flex-shrink-0" /> : <FiAlertTriangle className="w-4 h-4 flex-shrink-0" />}
              {testStatus.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Setup Advisor Chat */}
      <Card className="bg-card border-border shadow-xl shadow-primary/5">
        <CardHeader className="cursor-pointer" onClick={() => setChatOpen(p => !p)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiHelpCircle className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Setup Advisor</CardTitle>
            </div>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              {chatOpen ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
            </Button>
          </div>
          <CardDescription className="text-muted-foreground text-xs">
            Get help configuring your text processing assistant
          </CardDescription>
        </CardHeader>

        {chatOpen && (
          <CardContent className="space-y-4">
            <div ref={chatScrollRef} className="h-64 overflow-y-auto space-y-3 p-3 rounded-xl bg-secondary/30 border border-border/50">
              {chatMessages.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <FiHelpCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Ask me anything about setting up your text processing assistant</p>
                </div>
              )}
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-4 py-3 ${msg.role === 'user' ? 'bg-primary/20 text-foreground' : 'bg-secondary text-foreground'}`}>
                    <div className="text-sm">{renderMarkdown(msg.content)}</div>
                    {msg.suggestedAction && (
                      <div className="mt-2 p-2 rounded-lg text-xs font-medium flex items-center gap-2" style={{ backgroundColor: 'hsla(191, 97%, 70%, 0.1)', color: 'hsl(191, 97%, 70%)' }}>
                        <FiZap className="w-3 h-3 flex-shrink-0" />
                        {msg.suggestedAction}
                      </div>
                    )}
                    {msg.relatedTopics && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {msg.relatedTopics.split(',').map((topic, ti) => (
                          <button
                            key={ti}
                            onClick={() => setChatInput(topic.trim())}
                            className="text-xs px-2 py-0.5 rounded-full transition-colors"
                            style={{ backgroundColor: 'hsla(31, 100%, 65%, 0.15)', color: 'hsl(31, 100%, 65%)' }}
                          >
                            {topic.trim()}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-secondary text-foreground rounded-xl px-4 py-3">
                    <FiLoader className="w-4 h-4 animate-spin text-primary" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Input
                placeholder="Ask about setup, configuration, or troubleshooting..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                className="bg-secondary border-border flex-1"
                disabled={chatLoading}
              />
              <Button
                onClick={handleChatSend}
                disabled={chatLoading || !chatInput.trim()}
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-3"
              >
                <FiSend className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

// --- Agent Status Panel ---
function AgentStatusPanel({ activeAgentId }: { activeAgentId: string | null }) {
  const agents = [
    { id: ROW_AGENT_ID, name: 'Row Processing Agent', purpose: 'Processes each line of text with AI instructions' },
    { id: ADVISOR_AGENT_ID, name: 'Setup Advisor Agent', purpose: 'Provides configuration help and guidance' },
  ]

  return (
    <Card className="bg-card border-border shadow-xl shadow-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FiZap className="w-4 h-4 text-primary" />
          <CardTitle className="text-sm">AI Agents</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {agents.map(agent => {
          const isActive = activeAgentId === agent.id
          return (
            <div key={agent.id} className="flex items-center gap-3 py-2">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'animate-pulse' : ''}`} style={{ backgroundColor: isActive ? 'hsl(135, 94%, 60%)' : 'hsl(232, 16%, 40%)' }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{agent.name}</p>
                <p className="text-xs text-muted-foreground truncate">{agent.purpose}</p>
              </div>
              {isActive && (
                <Badge variant="outline" className="text-xs border-green-500/30 text-green-400 flex-shrink-0">Active</Badge>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// --- Main Page ---
export default function Page() {
  const [activeScreen, setActiveScreen] = useState<string>('dashboard')
  const [showSample, setShowSample] = useState(false)
  const [processingState, setProcessingState] = useState<ProcessingState>({
    isRunning: false,
    currentLine: 0,
    totalLines: 0,
    successCount: 0,
    failCount: 0,
    retryCount: 0,
    completed: false,
  })
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([])
  const [lastRun, setLastRun] = useState<{ lines: number; success: number; failed: number; timestamp: string } | null>(null)
  const [config, setConfig] = useState<ConfigState>({
    apiKey: '',
    endpoint: '',
    model: '',
    isConfigured: false,
  })
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  // Load config from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('spreadsheet_api_key') ?? ''
      const savedEndpoint = localStorage.getItem('spreadsheet_endpoint') ?? ''
      const savedModel = localStorage.getItem('spreadsheet_model') ?? ''
      setConfig({
        apiKey: savedKey,
        endpoint: savedEndpoint,
        model: savedModel,
        isConfigured: !!savedKey,
      })
    }
  }, [])

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground flex">
        {/* Sidebar */}
        <Sidebar activeScreen={activeScreen} setActiveScreen={setActiveScreen} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-screen">
          {/* Top Header */}
          <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                {activeScreen === 'dashboard' && 'Dashboard'}
                {activeScreen === 'processing' && 'Processing'}
                {activeScreen === 'settings' && 'Settings'}
              </h2>
            </div>
            <div className="flex items-center gap-4">
              {/* Sample Data Toggle */}
              <div className="flex items-center gap-2">
                <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground cursor-pointer">Sample Data</Label>
                <Switch
                  id="sample-toggle"
                  checked={showSample}
                  onCheckedChange={setShowSample}
                />
              </div>
              <Separator orientation="vertical" className="h-6 bg-border" />
              {/* Connection Status */}
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${config.isConfigured ? 'bg-green-400' : 'bg-amber-400'}`} />
                <span className="text-xs text-muted-foreground">
                  {config.isConfigured ? 'API Configured' : 'Not Configured'}
                </span>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              {activeScreen === 'dashboard' && (
                <DashboardScreen
                  showSample={showSample}
                  activityLog={activityLog}
                  lastRun={lastRun}
                  setActiveScreen={setActiveScreen}
                />
              )}

              {activeScreen === 'processing' && (
                <ProcessingScreen
                  processingState={processingState}
                  setProcessingState={setProcessingState}
                  activityLog={activityLog}
                  setActivityLog={setActivityLog}
                  showSample={showSample}
                  activeAgentId={activeAgentId}
                  setActiveAgentId={setActiveAgentId}
                  setLastRun={setLastRun}
                />
              )}

              {activeScreen === 'settings' && (
                <SettingsScreen
                  config={config}
                  setConfig={setConfig}
                  activeAgentId={activeAgentId}
                  setActiveAgentId={setActiveAgentId}
                />
              )}

              {/* Agent Status Panel */}
              <AgentStatusPanel activeAgentId={activeAgentId} />
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
