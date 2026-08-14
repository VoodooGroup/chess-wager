<?php

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

global $wpdb;
$wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'chess_wager_events');
$wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'chess_wager_presence');
$wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'chess_wager_games');
delete_option('chess_wager_db_ver');
delete_option('chess_wager_dapp_urls');
delete_option('chess_wager_keep_hours');
delete_option('chess_wager_last_cleanup');
