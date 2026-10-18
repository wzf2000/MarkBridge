<?php
/** Data-only sample renderer; source params remain the only writable chart data. */
function mbb_sdk_chart_projection(object $p, array $context): array
{
    $node = static fn($tag, $attrs = [], $children = [], $key = null) => array_merge(
        ['tag' => $tag, 'attrs' => (object) $attrs, 'children' => $children],
        $key === null ? [] : ['key' => $key],
    );
    $text = static fn($v) => (string) $v;
    $locale = str_starts_with($context['locale'] ?? 'en', 'zh');
    $colors = ['#2463a5', '#c45424', '#29805b', '#8557a5'];
    $xs = array_column($p->rows, 'x');
    $ys = [];
    foreach ($p->rows as $row) {
        foreach ($row->values as $v) {
            $ys[] = $v;
        }
    }
    $xmin = min($xs);
    $xmax = max($xs);
    $ymin = min($ys);
    $ymax = max($ys);
    if ($p->kind === 'bar') {
        $ymin = min(0, $ymin);
        $ymax = max(0, $ymax);
    }
    if ($xmin === $xmax) {
        $xmin -= 1;
        $xmax += 1;
    }
    if ($ymin === $ymax) {
        $ymin -= 1;
        $ymax += 1;
    }
    $x =
        $p->kind === 'bar'
            ? static fn($index) => 48 + (($index + 0.5) / count($p->rows)) * 490
            : static fn($v) => 48 + (($v - $xmin) / ($xmax - $xmin)) * 490;
    $y = static fn($v) => 240 - (($v - $ymin) / ($ymax - $ymin)) * 200;
    $svg = [
        $node('title', [], [$p->title], 'chart-title'),
        $node(
            'desc',
            [],
            [$locale ? '完整数据见下表。' : 'Complete data is available in the table below.'],
            'chart-description',
        ),
        $node('line', ['x1' => 48, 'y1' => 240, 'x2' => 538, 'y2' => 240, 'stroke' => '#546477']),
        $node('line', ['x1' => 48, 'y1' => 40, 'x2' => 48, 'y2' => 240, 'stroke' => '#546477']),
    ];
    foreach ($p->series as $i => $series) {
        $points = [];
        foreach ($p->rows as $row) {
            $points[] = [$x($row->x), $y($row->values[$i])];
        }
        if ($p->kind === 'line') {
            $svg[] = $node('polyline', [
                'points' => $points,
                'fill' => 'none',
                'stroke' => $colors[$i],
                'stroke-width' => 2,
            ]);
        }
        foreach ($p->rows as $j => $row) {
            $xx = $x($p->kind === 'bar' ? $j : $row->x);
            $yy = $y($row->values[$i]);
            if ($p->kind === 'bar') {
                $w = min(28, 430 / count($p->rows) / count($p->series));
                $zero = $y(0);
                $svg[] = $node('rect', [
                    'x' => $xx + ($i - count($p->series) / 2) * $w,
                    'y' => min($zero, $yy),
                    'width' => $w,
                    'height' => abs($zero - $yy),
                    'fill' => $colors[$i],
                ]);
            } elseif ($i >= 2) {
                $markers =
                    $i === 2
                        ? [[$xx, $yy - 4], [$xx - 4, $yy + 3], [$xx + 4, $yy + 3]]
                        : [[$xx, $yy - 4], [$xx + 4, $yy], [$xx, $yy + 4], [$xx - 4, $yy]];
                $svg[] = $node('polygon', ['points' => $markers, 'fill' => $colors[$i]]);
            } elseif ($i === 1) {
                $svg[] = $node('rect', [
                    'x' => $xx - 3,
                    'y' => $yy - 3,
                    'width' => 6,
                    'height' => 6,
                    'fill' => $colors[$i],
                ]);
            } else {
                $svg[] = $node('circle', [
                    'cx' => $xx,
                    'cy' => $yy,
                    'r' => 3,
                    'fill' => $colors[$i],
                ]);
            }
        }
    }
    $headers = [
        $node(
            'th',
            ['scope' => 'col'],
            [$p->x->label . ($p->x->unit !== '' ? ' (' . $p->x->unit . ')' : '')],
        ),
    ];
    foreach ($p->series as $series) {
        $headers[] = $node(
            'th',
            ['scope' => 'col'],
            [$series->label . ($p->y->unit !== '' ? ' (' . $p->y->unit . ')' : '')],
        );
    }
    $rows = [];
    foreach ($p->rows as $row) {
        $cells = [$node('th', ['scope' => 'row'], [$text($row->x)])];
        foreach ($row->values as $v) {
            $cells[] = $node('td', [], [$text($v)]);
        }
        $rows[] = $node('tr', [], $cells);
    }
    $legend = [];
    foreach ($p->series as $i => $series) {
        $legend[] = $node('li', [], [['● ', '■ ', '▲ ', '◆ '][$i] . $series->label]);
    }
    return [
        'schema' => 1,
        'tree' => [
            $node(
                'figure',
                [],
                [
                    $node('figcaption', [], [$p->title], 'figure-caption'),
                    $node(
                        'svg',
                        [
                            'viewBox' => [0, 0, 580, 280],
                            'width' => 580,
                            'height' => 280,
                            'role' => 'img',
                            'labelledby' => ['figure-caption', 'chart-title', 'chart-description'],
                        ],
                        $svg,
                    ),
                    $node('ul', ['class' => 'mbb-projection-legend'], $legend),
                ],
            ),
            $node(
                'p',
                [],
                [
                    $p->x->label .
                    ' / ' .
                    $p->y->label .
                    '; ' .
                    count($p->rows) .
                    ($locale ? ' 行，' : ' rows; ') .
                    count($p->series) .
                    ($locale ? ' 个序列。' : ' series.'),
                ],
            ),
            $node(
                'table',
                ['class' => 'mbb-projection-table'],
                [
                    $node('caption', [], [$p->title]),
                    $node('thead', [], [$node('tr', [], $headers)]),
                    $node('tbody', [], $rows),
                ],
            ),
        ],
    ];
}
