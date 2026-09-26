// The stored reference is a RichText format, so editing a paragraph never
// turns its footnote into an opaque HTML block.
let formatRegistered = false;
export function registerFootnotes() {
  const el = wp.element.createElement;
  const { useState } = wp.element;
  const { useBlockProps, useInnerBlocksProps, InnerBlocks, RichTextToolbarButton } = wp.blockEditor;

  if (!wp.blocks.getBlockType('mbb/footnotes')) {
    wp.blocks.registerBlockType('mbb/footnotes', {
      apiVersion: 3,
      title: '脚注定义',
      category: 'text',
      supports: { html: false },
      edit: () =>
        el(
          'section',
          useBlockProps({ className: 'mbb-footnotes' }),
          el('strong', { contentEditable: false }, '脚注定义'),
          el(
            'ol',
            useInnerBlocksProps(
              {},
              {
                allowedBlocks: ['mbb/footnote'],
                template: [['mbb/footnote', { label: 'note' }, [['core/paragraph']]]],
                templateLock: false,
              },
            ),
          ),
        ),
      save: () =>
        el(
          'section',
          useBlockProps.save({ className: 'mbb-footnotes' }),
          el('ol', useInnerBlocksProps.save()),
        ),
    });
    wp.blocks.registerBlockType('mbb/footnote', {
      apiVersion: 3,
      title: '脚注',
      category: 'text',
      parent: ['mbb/footnotes'],
      attributes: { label: { type: 'string', default: '' } },
      supports: { html: false },
      edit: ({ attributes, setAttributes }) =>
        el(
          'li',
          useBlockProps({ 'data-mbb-footnote': attributes.label }),
          el(wp.components.TextControl, {
            label: '脚注名称',
            value: attributes.label,
            onChange: (label) => setAttributes({ label }),
          }),
          el(InnerBlocks, {
            template: [['core/paragraph']],
            templateLock: false,
          }),
        ),
      save: ({ attributes }) =>
        el(
          'li',
          useBlockProps.save({ 'data-mbb-footnote': attributes.label }),
          el(InnerBlocks.Content),
        ),
    });
  }

  if (!formatRegistered) {
    formatRegistered = true;
    wp.richText.registerFormatType('mbb/footnote-ref', {
      title: '脚注引用',
      tagName: 'span',
      className: 'mbb-footnote-ref',
      attributes: { 'data-mbb-footnote': 'data-mbb-footnote' },
      edit: ({ isActive, value, onChange, activeAttributes }) => {
        const [open, setOpen] = useState(false);
        const [label, setLabel] = useState('');
        const current = activeAttributes?.['data-mbb-footnote'] || '';
        const submit = () => {
          if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(label)) return;
          let start = value.start;
          let end = value.end;
          if (isActive) {
            const hasFormat = (index) =>
              (value.formats[index] || []).some((format) => format.type === 'mbb/footnote-ref');
            // Adjacent references can share one continuous RichText format.
            // Select exactly one complete [^label] marker, never the whole run.
            const candidates = [...value.text.matchAll(/\[\^[\p{L}\p{N}_-]+\]/gu)].filter(
              (match) => {
                const first = match.index;
                const last = first + match[0].length;
                if (start < first || end > last) return false;
                for (let index = first; index < last; index++) if (!hasFormat(index)) return false;
                return true;
              },
            );
            const marker =
              candidates.find((match) => match[0] === `[^${current}]`) || candidates[0];
            if (!marker) return;
            start = marker.index;
            end = start + marker[0].length;
          } else {
            for (let index = start; index < end; index++)
              if ((value.formats[index] || []).some((format) => format.type === 'mbb/footnote-ref'))
                return;
          }
          const marker = `[^${label}]`;
          const inserted = wp.richText.insert(value, marker, start, end);
          onChange(
            wp.richText.applyFormat(
              inserted,
              {
                type: 'mbb/footnote-ref',
                attributes: { 'data-mbb-footnote': label },
              },
              start,
              start + marker.length,
            ),
          );
          setOpen(false);
        };
        return el(
          wp.element.Fragment,
          {},
          el(RichTextToolbarButton, {
            icon: 'editor-ol',
            title: '插入或修改脚注引用',
            isActive,
            onClick: () => {
              setLabel(current);
              setOpen(true);
            },
          }),
          open &&
            el(
              wp.components.Popover,
              { onClose: () => setOpen(false), focusOnMount: 'firstElement' },
              el(
                'div',
                { style: { padding: '12px', minWidth: '220px' } },
                el(wp.components.TextControl, {
                  label: '脚注名称',
                  value: label,
                  onChange: setLabel,
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submit();
                    }
                  },
                }),
                el(
                  wp.components.Button,
                  {
                    variant: 'primary',
                    onClick: submit,
                    disabled: !/^[\p{L}\p{N}_-]{1,64}$/u.test(label),
                  },
                  '插入引用',
                ),
              ),
            ),
        );
      },
    });
  }
}
