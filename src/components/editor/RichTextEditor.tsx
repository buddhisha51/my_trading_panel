import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Code,
  Heading2,
  Italic,
  List,
  ListOrdered,
  RemoveFormatting,
  Strikethrough,
} from 'lucide-react';
import { useEffect } from 'react';
import { EMPTY_TIPTAP_DOC } from '../../types/canvas';
import { extractClipboardImageFile } from '../../utils/imageClipboard';

interface RichTextEditorProps {
  docId: string;
  initialBodyJson: string;
  placeholder?: string;
  onChange: (bodyJson: string, bodyText: string) => void;
  onPasteImage?: (file: File) => void;
}

function safeParseTipTapJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || EMPTY_TIPTAP_DOC) as Record<string, unknown>;
  } catch {
    return JSON.parse(EMPTY_TIPTAP_DOC) as Record<string, unknown>;
  }
}

export function RichTextEditor({
  docId,
  initialBodyJson,
  placeholder = 'Write ICT setup notes, HTF narrative, triggers...',
  onChange,
  onPasteImage,
}: RichTextEditorProps) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          link: { openOnClick: false },
        }),
        Placeholder.configure({ placeholder }),
      ],
      content: safeParseTipTapJson(initialBodyJson),
      editorProps: {
        attributes: {
          class:
            'prose prose-invert prose-xs max-w-none min-h-[110px] px-2.5 py-2 text-xs text-slate-100 focus:outline-none [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_h2]:text-xs [&_h2]:font-bold [&_h2]:text-slate-100 [&_code]:rounded [&_code]:bg-slate-800 [&_code]:px-1',
        },
        handlePaste: (_view, event) => {
          const img = extractClipboardImageFile(event.clipboardData);
          if (img && onPasteImage) {
            event.preventDefault();
            onPasteImage(img);
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: ed }) => {
        onChange(JSON.stringify(ed.getJSON()), ed.getText());
      },
    },
    [docId],
  );

  // Sync if docId switches without unmounting
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const target = safeParseTipTapJson(initialBodyJson);
    const currentStr = JSON.stringify(editor.getJSON());
    const targetStr = JSON.stringify(target);
    if (currentStr !== targetStr && !editor.isFocused) {
      editor.commands.setContent(target);
    }
  }, [docId, initialBodyJson, editor]);

  if (!editor) {
    return (
      <div className="min-h-[130px] rounded-md border border-slate-800 bg-slate-950/70 p-2 text-[11px] text-slate-500">
        Loading editor...
      </div>
    );
  }

  const tools = [
    {
      label: 'Bold',
      icon: Bold,
      active: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic',
      icon: Italic,
      active: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Strike',
      icon: Strikethrough,
      active: editor.isActive('strike'),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: 'Heading',
      icon: Heading2,
      active: editor.isActive('heading', { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'Bullet List',
      icon: List,
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Numbered List',
      icon: ListOrdered,
      active: editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: 'Code',
      icon: Code,
      active: editor.isActive('code'),
      run: () => editor.chain().focus().toggleCode().run(),
    },
    {
      label: 'Clear Format',
      icon: RemoveFormatting,
      active: false,
      run: () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
    },
  ];

  return (
    <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-950/90 focus-within:border-blue-500/60">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-800 bg-slate-900/80 px-1.5 py-1">
        {tools.map(({ label, icon: Icon, active, run }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            onMouseDown={(e) => {
              e.preventDefault();
              run();
            }}
            className={`rounded p-1 transition-colors ${
              active
                ? 'bg-blue-500/20 text-blue-300'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
