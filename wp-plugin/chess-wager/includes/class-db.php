<?php

if (!defined('ABSPATH')) {
    exit;
}

class Chess_Wager_DB {
    public static function games_table() {
        global $wpdb;
        return $wpdb->prefix . 'chess_wager_games';
    }

    public static function events_table() {
        global $wpdb;
        return $wpdb->prefix . 'chess_wager_events';
    }

    public static function presence_table() {
        global $wpdb;
        return $wpdb->prefix . 'chess_wager_presence';
    }

    public static function activate() {
        self::maybe_upgrade();
    }

    public static function maybe_upgrade() {
        $installed = get_option('chess_wager_db_ver');
        if ($installed === CHESS_WAGER_DB_VER) {
            return;
        }
        global $wpdb;
        $charset = $wpdb->get_charset_collate();
        $games = self::games_table();
        $events = self::events_table();
        $presence = self::presence_table();
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta("CREATE TABLE {$games} (
            game_id BIGINT UNSIGNED NOT NULL,
            white VARCHAR(42) NOT NULL DEFAULT '',
            black VARCHAR(42) NOT NULL DEFAULT '',
            token VARCHAR(42) NOT NULL DEFAULT '',
            amount VARCHAR(80) NOT NULL DEFAULT '',
            status TINYINT NOT NULL DEFAULT 0,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (game_id)
        ) {$charset};");
        dbDelta("CREATE TABLE {$events} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            game_id BIGINT UNSIGNED NOT NULL,
            event_type VARCHAR(32) NOT NULL,
            payload LONGTEXT NOT NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY game_after (game_id, id)
        ) {$charset};");
        dbDelta("CREATE TABLE {$presence} (
            game_id BIGINT UNSIGNED NOT NULL,
            address VARCHAR(42) NOT NULL,
            last_seen DATETIME NOT NULL,
            PRIMARY KEY  (game_id, address)
        ) {$charset};");
        update_option('chess_wager_db_ver', CHESS_WAGER_DB_VER);
    }

    public static function schedule() {
        if (!wp_next_scheduled('chess_wager_cleanup')) {
            wp_schedule_event(time() + 300, 'hourly', 'chess_wager_cleanup');
        }
    }

    public static function unschedule() {
        $ts = wp_next_scheduled('chess_wager_cleanup');
        if ($ts) {
            wp_unschedule_event($ts, 'chess_wager_cleanup');
        }
    }

    public static function cleanup() {
        global $wpdb;
        $hours = Chess_Wager_Settings::keep_hours();
        $live_hours = max($hours, 14 * 24);
        $now = strtotime(current_time('mysql'));
        $cutoff = date('Y-m-d H:i:s', $now - ($hours * HOUR_IN_SECONDS));
        $live_cut = date('Y-m-d H:i:s', $now - ($live_hours * HOUR_IN_SECONDS));
        $games = self::games_table();
        $events = self::events_table();
        $presence = self::presence_table();

        $old_ids = $wpdb->get_col($wpdb->prepare(
            "SELECT game_id FROM {$games}
             WHERE (status IN (1,2) AND updated_at < %s)
                OR (status NOT IN (1,2) AND updated_at < %s)",
            $live_cut,
            $cutoff
        ));
        $deleted_games = 0;
        if ($old_ids) {
            $in = implode(',', array_map('absint', $old_ids));
            $wpdb->query("DELETE FROM {$events} WHERE game_id IN ({$in})");
            $wpdb->query("DELETE FROM {$presence} WHERE game_id IN ({$in})");
            $deleted_games = (int) $wpdb->query("DELETE FROM {$games} WHERE game_id IN ({$in})");
        }

        $deleted_events = (int) $wpdb->query($wpdb->prepare(
            "DELETE e FROM {$events} e
             LEFT JOIN {$games} g ON g.game_id = e.game_id
             WHERE g.game_id IS NULL AND e.created_at < %s",
            $cutoff
        ));
        $presence_cut = date('Y-m-d H:i:s', strtotime(current_time('mysql')) - (2 * HOUR_IN_SECONDS));
        $deleted_presence = (int) $wpdb->query($wpdb->prepare(
            "DELETE FROM {$presence} WHERE last_seen < %s",
            $presence_cut
        ));

        update_option('chess_wager_last_cleanup', [
            'at'        => current_time('mysql'),
            'hours'     => $hours,
            'games'     => $deleted_games,
            'events'    => $deleted_events,
            'presence'  => $deleted_presence,
        ]);
        return [
            'games'    => $deleted_games,
            'events'   => $deleted_events,
            'presence' => $deleted_presence,
        ];
    }
}
