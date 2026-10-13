import { translate as T, format as F } from './i18n.js';
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
    const requestEpoch = wp.element.useRef(0);
    wp.element.useLayoutEffect(() => {
      active.current = true;
      return () => {
        active.current = false;
        requestEpoch.current++;
      };
    }, [props.clientId, props.isSelected]);
    wp.element.useEffect(() => {
      if (!props.isSelected) {
        setBusy(false);
        setError('');
      }
    }, [props.isSelected]);
    const convert = async () => {
      if (!props.isSelected || busy) return;
      const block = registry.select('core/block-editor').getBlock(props.clientId);
      if (!block || block.name !== 'core/math') return;
      const signature = JSON.stringify([block.attributes, block.innerBlocks]);
      const tex = block.attributes.latex;
      const problem =
        block.innerBlocks.length > 0
          ? T('The native formula contains nested blocks and cannot be converted without loss.')
          : inspectNativeMath(
              {
                tex,
                mathML: block.attributes.mathML || '',
                attributes: block.attributes,
              },
              document,
            );
      if (problem) return setError(T(problem));
      const epoch = ++requestEpoch.current;
      setError('');
      setBusy(true);
      const structureProblem = await verifyNativeMathML(
        tex,
        block.attributes.mathML || '',
        true,
        document,
      );
      if (!active.current || epoch !== requestEpoch.current) return;
      if (structureProblem) {
        setBusy(false);
        return setError(T(structureProblem));
      }
      const renderingProblem = await verifyRenderedMath(tex, true, document);
      if (!active.current || epoch !== requestEpoch.current) return;
      setBusy(false);
      if (renderingProblem) return setError(T(renderingProblem));
      const current = registry.select('core/block-editor').getBlock(props.clientId);
      if (
        !current ||
        current.name !== 'core/math' ||
        JSON.stringify([current.attributes, current.innerBlocks]) !== signature ||
        registry.select('core/block-editor').getSelectedBlockClientId() !== props.clientId
      )
        return setError(
          T('The native formula changed during verification. Select it again before converting.'),
        );
      registry
        .dispatch('core/block-editor')
        .replaceBlock(props.clientId, wp.blocks.createBlock('mbb/math', { tex }));
    };
    return el(
      wp.element.Fragment,
      {},
      props.isSelected
        ? el(
            'div',
            { className: 'mbb-native-math-block-action' },
            el(
              wp.components.Button,
              {
                variant: 'secondary',
                onClick: convert,
                disabled: busy,
                'aria-busy': busy,
                className: 'mbb-native-math-convert',
              },
              busy ? T('Verifying the formula…') : T('Convert to display formula (MathJax)'),
            ),
          )
        : null,
      el(BlockEdit, props),
      props.isSelected
        ? el(
            wp.blockEditor.BlockControls,
            {},
            el(
              wp.components.ToolbarGroup,
              {},
              el(wp.components.ToolbarButton, {
                label: T('Convert to display formula (MathJax)'),
                onClick: convert,
                disabled: busy,
                children: T('Convert to display formula'),
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
