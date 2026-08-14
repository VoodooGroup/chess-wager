<?php

if (!defined('ABSPATH')) {
    exit;
}

class Chess_Wager_Admin {
    public static function menu() {
        add_menu_page(
            'Chess Wager',
            'Chess Wager',
            'manage_options',
            'chess-wager',
            [self::class, 'page'],
            'dashicons-groups',
            58
        );
    }

    public static function page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        global $wpdb;
        $games = $wpdb->get_results(
            'SELECT * FROM ' . Chess_Wager_DB::games_table() . ' ORDER BY updated_at DESC LIMIT 80',
            ARRAY_A
        );
        $presence = Chess_Wager_DB::presence_table();
        $cutoff = gmdate('Y-m-d H:i:s', time() - 20);
        echo '<div class="wrap"><h1>Chess Wager</h1>';
        echo '<p>Put <code>[chess_wager]</code> on a page. The plugin remembers who is in each game so a dropped connection does not wipe the match.</p>';
        echo '<p>Relay URL (the dApp uses this automatically): <code>' . esc_html(rest_url('chess-wager/v1')) . '</code></p>';
        echo '<table class="widefat striped"><thead><tr>';
        echo '<th>Game</th><th>White</th><th>Black</th><th>Online now</th><th>Updated</th>';
        echo '</tr></thead><tbody>';
        if (!$games) {
            echo '<tr><td colspan="5">No games saved yet. Play one on the page with the shortcode.</td></tr>';
        }
        foreach ($games ?: [] as $g) {
            $online = $wpdb->get_col($wpdb->prepare(
                "SELECT address FROM {$presence} WHERE game_id = %d AND last_seen >= %s",
                $g['game_id'],
                $cutoff
            ));
            $who = $online ? implode(', ', $online) : '—';
            echo '<tr>';
            echo '<td>#' . esc_html($g['game_id']) . '</td>';
            echo '<td><code>' . esc_html($g['white'] ?: '—') . '</code></td>';
            echo '<td><code>' . esc_html($g['black'] ?: '—') . '</code></td>';
            echo '<td>' . esc_html($who) . '</td>';
            echo '<td>' . esc_html($g['updated_at']) . '</td>';
            echo '</tr>';
        }
        echo '</tbody></table></div>';
    }
}
