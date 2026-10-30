<?php
// Public server-side capability: never expose a full document through REST.
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
function markbridge_component_instance_snapshot(
    int $postId,
    string $instanceId,
    string $component,
    string $version,
): array {
    try {
        $pair = mbb_references_snapshot($postId);
        $matches = [];
        $walk = static function (array $blocks) use (&$walk, &$matches, $instanceId) {
            foreach ($blocks as $block) {
                if (
                    ($block['blockName'] ?? '') === 'mbb/component' &&
                    ($block['attrs']['id'] ?? '') === $instanceId
                ) {
                    $matches[] = $block['attrs'];
                }
                $walk($block['innerBlocks'] ?? []);
            }
        };
        $walk(parse_blocks($pair['post']->post_content));
        if (count($matches) !== 1) {
            throw new RuntimeException('unavailable');
        }
        $attrs = $matches[0];
        $provider = mbb_component_provider($component, $version);
        $params = json_decode(mbb_component_json($attrs['params'] ?? null));
        if (
            ($attrs['component'] ?? '') !== $component ||
            ($attrs['componentVersion'] ?? '') !== $version ||
            !$provider ||
            ($provider['status'] ?? '') !== 'available' ||
            !mbb_component_pure_params($params) ||
            !mbb_component_schema($params, $provider['schema']) ||
            !mbb_component_domain_valid($component, $version, $params, null) ||
            isset($attrs['activity'])
        ) {
            throw new RuntimeException('unavailable');
        }
        if (($provider['protocolVersion'] ?? null) === 2) {
            mbb_component_v2_check($provider);
        } elseif (
            !hash_equals(
                $provider['resource']['sha256'],
                (string) hash_file('sha256', $provider['resource']['file']),
            )
        ) {
            throw new RuntimeException('unavailable');
        }
        $source = mbb_references_source_digest($pair['post']);
        if (
            $source !== null &&
            !hash_equals($source, hash('sha256', $pair['post']->post_content_filtered))
        ) {
            throw new RuntimeException('unavailable');
        }
        $identity = [
            'postId' => $postId,
            'instanceId' => $instanceId,
            'component' => $component,
            'version' => $version,
            'user' => get_current_user_id(),
            'session' => hash('sha256', wp_get_session_token()),
            'token' => mbb_token($pair['post']),
            'source' => $source,
            'provider' => markbridge_teaching_component_fingerprint($component, $provider),
            'projection' => mbb_component_projection_fingerprint($component, $version),
            'params' => $params,
        ];
        $identity['stamp'] = hash_hmac('sha256', mbb_component_json($identity), wp_salt('auth'));
        if (
            !mbb_references_final($postId, $pair['hash']) ||
            get_current_user_id() !== $identity['user'] ||
            !hash_equals($identity['session'], hash('sha256', wp_get_session_token())) ||
            !hash_equals($identity['token'], mbb_token(mbb_references_fresh_post($postId))) ||
            mbb_references_source_digest(mbb_references_fresh_post($postId)) !== $source
        ) {
            throw new RuntimeException('unavailable');
        }
        return $identity;
    } catch (Throwable) {
        throw new RuntimeException('unavailable');
    }
}
function markbridge_component_instance_final(array $snapshot): bool
{
    try {
        $stamp = $snapshot['stamp'] ?? null;
        if (!is_string($stamp)) {
            return false;
        }
        $sealed = $snapshot;
        unset($sealed['stamp']);
        if (
            !hash_equals($stamp, hash_hmac('sha256', mbb_component_json($sealed), wp_salt('auth')))
        ) {
            return false;
        }
        // Reconstruct authority from storage after verifying the complete sealed snapshot.
        $fresh = markbridge_component_instance_snapshot(
            $snapshot['postId'],
            $snapshot['instanceId'],
            $snapshot['component'],
            $snapshot['version'],
        );
        return is_string($snapshot['stamp'] ?? null) &&
            hash_equals($fresh['stamp'], $snapshot['stamp']);
    } catch (Throwable) {
        return false;
    }
}
