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
        if (isset($_POST['chess_wager_save']) && check_admin_referer('chess_wager_save')) {
            Chess_Wager_Settings::save(wp_unslash($_POST['dapp_urls'] ?? ''));
            echo '<div class="updated notice"><p>Saved the dApp URLs.</p></div>';
        }
        global $wpdb;
        $games = $wpdb->get_results(
            'SELECT * FROM ' . Chess_Wager_DB::games_table() . ' ORDER BY updated_at DESC LIMIT 80',
            ARRAY_A
        );
        $presence = Chess_Wager_DB::presence_table();
        $cutoff = gmdate('Y-m-d H:i:s', time() - 20);
        $relay = rest_url('chess-wager/v1');
        echo '<div class="wrap"><h1>Chess Wager</h1>';
        echo '<p>Install this plugin on <strong>voodootoken.com</strong>. That is the memory. The board can live on one or more other URLs (Vercel, a subdomain, extra domains).</p>';
        echo '<form method="post" style="max-width:720px;margin:16px 0 24px">';
        wp_nonce_field('chess_wager_save');
        echo '<h2>Where the dApp is hosted</h2>';
        echo '<p>One URL per line. First line is the main invite link. Examples:</p>';
        echo '<p><code>https://chess.voodootoken.com</code><br><code>https://chess-wager.vercel.app</code></p>';
        echo '<textarea name="dapp_urls" rows="5" class="large-text code">' . esc_textarea(Chess_Wager_Settings::raw()) . '</textarea>';
        echo '<p><button type="submit" name="chess_wager_save" class="button button-primary" value="1">Save URLs</button></p>';
        echo '</form>';
        echo '<p>The GitHub / Vercel dApp already uses this plugin on voodootoken.com. Relay URL: <code>' . esc_html($relay) . '</code></p>';
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
