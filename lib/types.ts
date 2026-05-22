export type FileType = 'pdf' | 'docx' | 'txt';

export type Document = {
  id: string;
  title: string;
  tags: string[];
  fileType: FileType;
  fileSize: number;
  createdAt: string;
};

export type ExplanationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  sequence: number;
};

export type SavedExplanation = {
  id: string;
  documentId: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  createdAt: string;
  updatedAt: string;
  messages: ExplanationMessage[];
};
