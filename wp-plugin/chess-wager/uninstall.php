<?php

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

global $wpdb;
$wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'chess_wager_events');
$wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'chess_wager_presence');
$wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'chess_wager_games');
delete_option('chess_wager_db_ver');
