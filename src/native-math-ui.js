import {
  inspectNativeMath,
  verifyNativeMathML,
  verifyRenderedMath,
} from './native-math-conversion.js';

export function registerNativeMathConversion() {
  const el = wp.element.createElement;
  const CoreMathEdit = ({ BlockEdit, ...props }) => {
    const [error, setError] = wp.element.useState('');
    const [busy, setBusy] = wp.element.useState(false);
    const registry = wp.data.useRegistry();
    const active = wp.element.useRef(true);
    wp.element.useEffect(() => {
      active.current = true;
      return () => {
        active.current = false;
      };
    }, []);
    const convert = async () => {
      const block = registry.select('core/block-editor').getBlock(props.clientId);
      if (!block || block.name !== 'core/math') return;
      const signature = JSON.stringify([block.attributes, block.innerBlocks]);
      const tex = block.attributes.latex;
      const problem =
        block.innerBlocks.length > 0
          ? '原生公式含嵌套区块，无法无损转换。'
          : inspectNativeMath(
              {
                tex,
                mathML: block.attributes.mathML || '',
                attributes: block.attributes,
              },
              document,
            );
      if (problem) return setError(problem);
      setError('');
      setBusy(true);
      const structureProblem = await verifyNativeMathML(
        tex,
        block.attributes.mathML || '',
        true,
        document,
      );
      if (!active.current) return;
      if (structureProblem) {
        setBusy(false);
        return setError(structureProblem);
      }
      const renderingProblem = await verifyRenderedMath(tex, true, document);
      if (!active.current) return;
      setBusy(false);
      if (renderingProblem) return setError(renderingProblem);
      const current = registry.select('core/block-editor').getBlock(props.clientId);
      if (
        !current ||
        current.name !== 'core/math' ||
        JSON.stringify([current.attributes, current.innerBlocks]) !== signature ||
        registry.select('core/block-editor').getSelectedBlockClientId() !== props.clientId
      )
        return setError('原生公式在验证期间已变化，请重新选择后转换。');
      registry
        .dispatch('core/block-editor')
        .replaceBlock(props.clientId, wp.blocks.createBlock('mbb/math', { tex }));
    };
    return el(
      wp.element.Fragment,
      {},
      el(BlockEdit, props),
      props.isSelected
        ? el(
            wp.blockEditor.BlockControls,
            {},
            el(
              wp.components.ToolbarGroup,
              {},
              el(wp.components.ToolbarButton, {
                label: '转换为行间公式（MathJax）',
                onClick: convert,
                disabled: busy,
                children: '转换为行间公式',
              }),
            ),
          )
        : null,
      props.isSelected && error
        ? el('div', { role: 'alert', className: 'mbb-math-conversion-error' }, error)
        : null,
    );
  };
  const withCoreMathConversion = (BlockEdit) => (props) =>
    props.name === 'core/math' ? el(CoreMathEdit, { BlockEdit, ...props }) : el(BlockEdit, props);
  wp.hooks.addFilter('editor.BlockEdit', 'mbb/native-math-conversion', withCoreMathConversion);
}
