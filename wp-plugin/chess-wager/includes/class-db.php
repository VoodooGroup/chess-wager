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
}
