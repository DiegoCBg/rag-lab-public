import { create } from 'zustand'

interface WorkspaceState {
  documentScopeMode: 'all' | 'selected'
  selectedDocumentIds: string[]
  setDocumentScopeMode: (mode: 'all' | 'selected') => void
  setSelectedDocumentIds: (ids: string[]) => void
  provider: string
  strategy: string
  compareStrategy: string
  topK: number
  contentTypeFilter: string
  statusFilter: string
  questionDraft: string
  setProvider: (provider: string) => void
  setStrategy: (strategy: string) => void
  setCompareStrategy: (compareStrategy: string) => void
  setTopK: (topK: number) => void
  setContentTypeFilter: (contentTypeFilter: string) => void
  setStatusFilter: (statusFilter: string) => void
  setQuestionDraft: (questionDraft: string) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  documentScopeMode: 'all',
  selectedDocumentIds: [],
  setDocumentScopeMode: (documentScopeMode) => set({ documentScopeMode }),
  setSelectedDocumentIds: (selectedDocumentIds) => set({ selectedDocumentIds }),
  provider: 'ollama',
  strategy: 'hybrid',
  compareStrategy: 'vector',
  topK: 10,
  contentTypeFilter: '',
  statusFilter: 'indexed',
  questionDraft: '',
  setProvider: (provider) => set({ provider }),
  setStrategy: (strategy) => set({ strategy }),
  setCompareStrategy: (compareStrategy) => set({ compareStrategy }),
  setTopK: (topK) => set({ topK }),
  setContentTypeFilter: (contentTypeFilter) => set({ contentTypeFilter }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setQuestionDraft: (questionDraft) => set({ questionDraft }),
}))
