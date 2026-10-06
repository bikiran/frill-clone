<?php
/**
 * Colvy — WooCommerce bridge.
 *
 * Abandoned carts (with the pages the shopper browsed first), recovered
 * orders, and the WooCommerce webhooks that tell Colvy about new orders and
 * stock changes. Replaces the old "Colvy Bridge for WooCommerce" plugin and
 * keeps its settings. Loaded by colvy.php.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

/* ───────────────────────────── Config ───────────────────────────── */

function colvywp_wc_company_id() {
	$id = trim( (string) colvywp_get( 'company_id' ) );
	return $id ?: trim( (string) get_option( 'colvy_ac_company_id', '' ) ); // old bridge setting
}
function colvywp_wc_endpoint() { return get_option( 'colvy_ac_endpoint', '' ) ?: rtrim( COLVY_API_BASE, '/' ) . '/api/abandoned-carts'; }
function colvywp_wc_base()     { $p = wp_parse_url( colvywp_wc_endpoint() ); return ( isset( $p['scheme'] ) ? $p['scheme'] : 'https' ) . '://' . ( isset( $p['host'] ) ? $p['host'] : 'colvy.com' ) . ( isset( $p['port'] ) ? ':' . (int) $p['port'] : '' ); }
function colvywp_wc_interval() { return (int) get_option( 'colvy_ac_interval', 8 ); }
function colvywp_wc_ready()    { return colvywp_wc_company_id() !== '' && function_exists( 'WC' ); }
function colvywp_wc_carts_on() { return get_option( 'colvywp_carts', 'on' ) !== 'off'; }

// Bridge-only installs had just the Company ID — carry it into the shared connection.
add_action( 'admin_init', function () {
	if ( ! colvywp_get( 'company_id' ) && get_option( 'colvy_ac_company_id' ) ) colvywp_set( array( 'company_id' => trim( get_option( 'colvy_ac_company_id' ) ) ) );
} );

/* ─────────────────── Page history (browsing before the cart) ─────────────────── */
// Every page the shopper views, kept in their Woo session. Sent with an
// abandoned cart so Colvy can show what they looked at before leaving.

add_action( 'wp', function () {
	if ( is_admin() || wp_doing_ajax() || ! colvywp_wc_ready() || ! colvywp_wc_carts_on() ) return;
	if ( ! WC()->session ) return;
	$url   = home_url( add_query_arg( array(), isset( $GLOBALS['wp']->request ) ? $GLOBALS['wp']->request : '' ) );
	$title = function_exists( 'is_product' ) && is_product() ? get_the_title() : wp_get_document_title();
	$h     = WC()->session->get( 'colvy_page_history', array() );
	if ( ! is_array( $h ) ) $h = array();
	$last  = end( $h );
	if ( ! $last || ( isset( $last['url'] ) ? $last['url'] : '' ) !== $url ) {
		$h[] = array( 'url' => $url, 'title' => wp_strip_all_tags( $title ), 'ts' => gmdate( 'c' ) );
		if ( count( $h ) > 40 ) $h = array_slice( $h, -40 );
		WC()->session->set( 'colvy_page_history', $h );
	}
} );

/* ───────────────────────────── Cart capture ───────────────────────────── */

// Classic checkout: fires as they type their details.
add_action( 'woocommerce_checkout_update_order_review', function ( $post_data ) {
	if ( ! function_exists( 'WC' ) || ! WC()->cart ) return;
	parse_str( $post_data, $data );
	if ( empty( $data['billing_email'] ) && empty( $data['billing_phone'] ) ) return;
	colvywp_wc_send_cart( array_map( 'sanitize_text_field', array_intersect_key( (array) $data, array_flip( array(
		'billing_first_name', 'billing_last_name', 'billing_email', 'billing_phone', 'billing_address_1',
		'billing_city', 'billing_state', 'billing_postcode', 'billing_country', 'order_comments',
	) ) ) ) );
}, 20 );

// Block checkout (Store API).
add_action( 'woocommerce_store_api_checkout_update_order_from_request', function ( $order ) {
	if ( ! function_exists( 'WC' ) || ! WC()->cart ) return;
	if ( ! $order->get_billing_email() && ! $order->get_billing_phone() ) return;
	colvywp_wc_send_cart( array(
		'billing_first_name' => $order->get_billing_first_name(), 'billing_last_name' => $order->get_billing_last_name(),
		'billing_email'      => $order->get_billing_email(),      'billing_phone'     => $order->get_billing_phone(),
		'billing_address_1'  => $order->get_billing_address_1(),  'billing_city'      => $order->get_billing_city(),
		'billing_state'      => $order->get_billing_state(),      'billing_postcode'  => $order->get_billing_postcode(),
		'billing_country'    => $order->get_billing_country(),    'order_comments'    => $order->get_customer_note(),
	) );
}, 20 );

// Logged-in shoppers changing their cart.
function colvywp_wc_cart_changed() {
	if ( ! function_exists( 'WC' ) || ! WC()->cart ) return;
	$u = wp_get_current_user();
	if ( ! $u || ! $u->ID ) return;
	$m = function ( $k, $fallback = '' ) use ( $u ) { $v = get_user_meta( $u->ID, $k, true ); return $v ? $v : $fallback; };
	$data = array(
		'billing_first_name' => $m( 'billing_first_name', $u->first_name ), 'billing_last_name' => $m( 'billing_last_name', $u->last_name ),
		'billing_email'      => $m( 'billing_email', $u->user_email ),      'billing_phone'     => $m( 'billing_phone' ),
		'billing_address_1'  => $m( 'billing_address_1' ), 'billing_city' => $m( 'billing_city' ), 'billing_state' => $m( 'billing_state' ),
		'billing_postcode'   => $m( 'billing_postcode' ),  'billing_country' => $m( 'billing_country' ),
	);
	if ( empty( $data['billing_email'] ) && empty( $data['billing_phone'] ) ) return;
	colvywp_wc_send_cart( $data );
}
add_action( 'woocommerce_add_to_cart', 'colvywp_wc_cart_changed', 20 );
add_action( 'woocommerce_cart_item_removed', 'colvywp_wc_cart_changed', 20 );
add_action( 'woocommerce_after_cart_item_quantity_update', 'colvywp_wc_cart_changed', 20 );

function colvywp_wc_send_cart( $data ) {
	if ( ! colvywp_wc_ready() || ! colvywp_wc_carts_on() ) return;
	$cart = WC()->cart;
	if ( ! $cart ) return;
	$sid = colvywp_wc_session_id();

	$interval = colvywp_wc_interval();
	if ( $interval > 0 ) {
		$tk = 'colvy_last_' . md5( $sid );
		if ( get_transient( $tk ) ) return;
		set_transient( $tk, 1, $interval );
	}

	$items = array();
	foreach ( $cart->get_cart() as $line ) {
		$p = isset( $line['data'] ) ? $line['data'] : null;
		$items[] = array(
			'product_id'   => isset( $line['product_id'] ) ? $line['product_id'] : null,
			'variation_id' => ! empty( $line['variation_id'] ) ? $line['variation_id'] : null,
			'name'         => $p ? $p->get_name() : '',
			'sku'          => $p ? $p->get_sku() : '',
			'quantity'     => isset( $line['quantity'] ) ? $line['quantity'] : 1,
			'price'        => $p ? wc_get_price_to_display( $p ) : null,
			'permalink'    => $p ? get_permalink( $p->get_id() ) : null,
		);
	}
	if ( ! $items ) return;

	$coupons  = $cart->get_applied_coupons();
	$chosen   = WC()->session ? WC()->session->get( 'chosen_shipping_methods' ) : array();
	$shipping = $chosen ? array( 'method' => is_array( $chosen ) ? $chosen[0] : $chosen, 'cost' => $cart->get_shipping_total() ) : null;
	$history  = WC()->session ? WC()->session->get( 'colvy_page_history', array() ) : array();
	$g = function ( $k ) use ( $data ) { return isset( $data[ $k ] ) ? $data[ $k ] : ''; };

	$payload = array(
		'external_id'  => $sid,
		'name'         => trim( $g( 'billing_first_name' ) . ' ' . $g( 'billing_last_name' ) ),
		'email'        => $g( 'billing_email' ),
		'phone'        => $g( 'billing_phone' ),
		'billing'      => array(
			'first_name' => $g( 'billing_first_name' ), 'last_name' => $g( 'billing_last_name' ), 'email' => $g( 'billing_email' ),
			'phone' => $g( 'billing_phone' ), 'address_1' => $g( 'billing_address_1' ), 'city' => $g( 'billing_city' ),
			'state' => $g( 'billing_state' ), 'postcode' => $g( 'billing_postcode' ), 'country' => $g( 'billing_country' ),
		),
		'items'        => $items,
		'coupon'       => $coupons ? $coupons[0] : null,
		'shipping'     => $shipping,
		'notes'        => $g( 'order_comments' ),
		'subtotal'     => (float) $cart->get_subtotal(),
		'total'        => (float) $cart->get_total( 'edit' ),
		'currency'     => get_woocommerce_currency(),
		'cart_url'     => wc_get_checkout_url(),
		'page_history' => array_values( is_array( $history ) ? $history : array() ),
	);
	wp_remote_post( add_query_arg( 'company', colvywp_wc_company_id(), colvywp_wc_endpoint() ), array(
		'timeout' => 5, 'blocking' => false, 'headers' => array( 'Content-Type' => 'application/json' ), 'body' => wp_json_encode( $payload ),
	) );
}

function colvywp_wc_recovered( $order_id ) {
	if ( ! colvywp_wc_ready() ) return;
	$sid = colvywp_wc_session_id();
	if ( ! $sid ) return;
	wp_remote_post( add_query_arg( array( 'company' => colvywp_wc_company_id(), 'recovered' => 1 ), colvywp_wc_endpoint() ), array(
		'timeout' => 5, 'blocking' => false, 'headers' => array( 'Content-Type' => 'application/json' ),
		'body'    => wp_json_encode( array( 'external_id' => $sid, 'status' => 'recovered', 'recovered_order_id' => is_object( $order_id ) ? $order_id->get_id() : $order_id ) ),
	) );
}
add_action( 'woocommerce_checkout_order_processed', 'colvywp_wc_recovered', 20, 1 );
add_action( 'woocommerce_store_api_checkout_order_processed', 'colvywp_wc_recovered', 20, 1 );

function colvywp_wc_session_id() {
	if ( WC()->session && method_exists( WC()->session, 'get_customer_id' ) ) {
		$id = WC()->session->get_customer_id();
		if ( ! empty( $id ) ) return 'wc_' . $id;
	}
	if ( WC()->cart ) { $h = WC()->cart->get_cart_hash(); if ( $h ) return 'cart_' . $h; }
	return 'anon_' . md5( uniqid( '', true ) );
}

/* ─────────────────────── Webhooks (orders + stock) ─────────────────────── */

function colvywp_wc_topics() { return array( 'order.created' => 'New orders', 'order.updated' => 'Order status changes', 'product.updated' => 'Stock changes (back in stock)' ); }
function colvywp_wc_delivery_url() { return colvywp_wc_base() . '/api/webhooks/woocommerce?company=' . rawurlencode( colvywp_wc_company_id() ); }

/** Active Colvy webhooks, topic → true. */
function colvywp_wc_existing() {
	if ( ! colvywp_wc_ready() || ! class_exists( 'WC_Data_Store' ) ) return array();
	$out = array();
	try {
		foreach ( WC_Data_Store::load( 'webhook' )->search_webhooks( array( 'limit' => 100 ) ) as $id ) {
			$wh = wc_get_webhook( $id );
			if ( $wh && strpos( $wh->get_delivery_url(), '/api/webhooks/woocommerce' ) !== false && $wh->get_status() === 'active' ) $out[ $wh->get_topic() ] = true;
		}
	} catch ( Exception $e ) {}
	return $out;
}

/** Create / repair the webhooks from inside WordPress (we already have admin rights here). */
function colvywp_wc_register_webhooks() {
	if ( ! colvywp_wc_ready() ) return array( 'Connect Colvy first.' );
	if ( ! class_exists( 'WC_Webhook' ) ) return array( 'WooCommerce webhooks are unavailable.' );
	$url = colvywp_wc_delivery_url(); $res = array();
	$secret = (string) colvywp_get( 'api_key' );
	try {
		foreach ( WC_Data_Store::load( 'webhook' )->search_webhooks( array( 'limit' => 100 ) ) as $id ) {
			$wh = wc_get_webhook( $id );
			if ( $wh && strpos( $wh->get_delivery_url(), '/api/webhooks/woocommerce' ) !== false ) {
				// Sign deliveries with the plugin key so Colvy can tell they're really from this store.
				$fix = $wh->get_delivery_url() !== $url || $wh->get_status() !== 'active' || ( $secret && $wh->get_secret() !== $secret );
				if ( $fix ) {
					$wh->set_delivery_url( $url ); $wh->set_status( 'active' ); if ( $secret ) $wh->set_secret( $secret ); $wh->save();
					$res[] = $wh->get_topic() . ': repaired';
				}
			}
		}
	} catch ( Exception $e ) {}
	$have = colvywp_wc_existing();
	foreach ( array_keys( colvywp_wc_topics() ) as $topic ) {
		if ( isset( $have[ $topic ] ) ) { $res[] = $topic . ': already active'; continue; }
		try {
			$wh = new WC_Webhook();
			$wh->set_name( 'Colvy — ' . $topic );
			$wh->set_topic( $topic );
			$wh->set_delivery_url( $url );
			$wh->set_status( 'active' );
			if ( $secret ) $wh->set_secret( $secret );
			$wh->set_user_id( get_current_user_id() );
			$wh->save();
			$res[] = $topic . ': connected';
		} catch ( Exception $e ) { $res[] = $topic . ': failed — ' . $e->getMessage(); }
	}
	return $res;
}

/* ───────────────────────────── Admin page ───────────────────────────── */

function colvywp_page_woocommerce() {
	if ( ! current_user_can( 'manage_woocommerce' ) && ! current_user_can( 'manage_options' ) ) return;
	$msg = null; $hooks = null; $test = null;
	if ( isset( $_POST['colvywp_wc_nonce'] ) && wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['colvywp_wc_nonce'] ) ), 'colvywp_wc' ) ) {
		if ( isset( $_POST['save'] ) ) {
			update_option( 'colvywp_carts', empty( $_POST['carts'] ) ? 'off' : 'on' );
			$ep = isset( $_POST['endpoint'] ) ? esc_url_raw( wp_unslash( $_POST['endpoint'] ) ) : '';
			update_option( 'colvy_ac_endpoint', $ep === rtrim( COLVY_API_BASE, '/' ) . '/api/abandoned-carts' ? '' : $ep );
			update_option( 'colvy_ac_interval', isset( $_POST['interval'] ) ? max( 0, (int) $_POST['interval'] ) : 8 );
			$msg = array( 'ok', 'Saved.' );
		}
		if ( isset( $_POST['hooks'] ) ) $hooks = colvywp_wc_register_webhooks();
		if ( isset( $_POST['test'] ) ) {
			$r = wp_remote_post( add_query_arg( 'company', colvywp_wc_company_id(), colvywp_wc_endpoint() ), array(
				'timeout' => 15, 'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode( array(
					'external_id' => 'test_' . time(), 'name' => 'Colvy Test Customer', 'email' => 'carttest@example.com', 'phone' => '0400000000',
					'items' => array( array( 'name' => 'Test Product', 'quantity' => 1, 'price' => 9.99 ) ), 'total' => 9.99,
					'currency' => function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'AUD',
					'cart_url' => function_exists( 'wc_get_checkout_url' ) ? wc_get_checkout_url() : home_url(),
				) ),
			) );
			$code = is_wp_error( $r ) ? 0 : wp_remote_retrieve_response_code( $r );
			$test = $code === 200
				? array( 'ok', 'Test cart reached Colvy — look for “Colvy Test Customer” under Abandoned carts.' )
				: array( 'warn', 'Colvy didn’t get the test cart (' . ( is_wp_error( $r ) ? esc_html( $r->get_error_message() ) : 'HTTP ' . (int) $code ) . '). A security plugin or host firewall is usually blocking outbound requests.' );
		}
	}
	echo '<div class="wrap cw">';
	$acc = colvywp_header( 'colvy-woocommerce', 'Orders, stock and abandoned carts flowing into Colvy.' );
	if ( $msg ) colvywp_notice( $msg[0], $msg[1] );
	if ( $test ) colvywp_notice( $test[0], $test[1] );
	if ( ! class_exists( 'WooCommerce' ) ) { colvywp_notice( 'warn', 'WooCommerce isn’t active on this site.' ); echo '</div>'; return; }
	if ( ! colvywp_wc_ready() ) { colvywp_notice( 'warn', 'Connect Colvy first, under <a href="' . esc_url( admin_url( 'admin.php?page=colvy-settings' ) ) . '">Connection</a>.' ); echo '</div>'; return; }
	$have = colvywp_wc_existing();
	$all  = count( array_intersect_key( colvywp_wc_topics(), $have ) ) === count( colvywp_wc_topics() );
	?>
	<div class="cw-grid2">
		<div class="cw-card">
			<div class="cw-row" style="border:0;padding-top:4px">
				<div><h3 class="cw-h3">Order &amp; stock notifications</h3><p class="cw-help">Tells Colvy when an order is placed or changes (opens a chat, sends the thank-you) and when stock comes back (texts the waitlist).</p></div>
				<span class="cw-pill <?php echo $all ? 'on' : 'bad'; ?>"><?php echo $all ? 'Connected' : 'Needs connecting'; ?></span>
			</div>
			<ul class="cw-checks">
				<?php foreach ( colvywp_wc_topics() as $t => $l ) : $on = isset( $have[ $t ] ); ?>
				<li class="<?php echo $on ? 'on' : ''; ?>"><span class="cw-dot"><?php echo colvywp_i( $on ? 'check' : 'warn', 12 ); // phpcs:ignore ?></span><?php echo esc_html( $l ); ?> <code><?php echo esc_html( $t ); ?></code></li>
				<?php endforeach; ?>
			</ul>
			<form method="post"><?php wp_nonce_field( 'colvywp_wc', 'colvywp_wc_nonce' ); ?><button name="hooks" value="1" class="cw-btn<?php echo $all ? ' cw-btn-ghost' : ''; ?>"><?php echo $all ? 'Re-check / repair' : 'Connect notifications'; ?></button></form>
			<?php if ( $hooks ) : ?><ul class="cw-log"><?php foreach ( $hooks as $h ) echo '<li><code>' . esc_html( $h ) . '</code></li>'; ?></ul><?php endif; ?>
		</div>

		<form method="post" class="cw-card cw-form">
			<?php wp_nonce_field( 'colvywp_wc', 'colvywp_wc_nonce' ); ?>
			<div class="cw-row" style="border:0;padding-top:4px">
				<div><h3 class="cw-h3">Abandoned carts</h3><p class="cw-help">When someone starts checkout and leaves, Colvy gets their cart and the pages they browsed — so you can follow up by text.</p></div>
				<label class="cw-switch"><input type="checkbox" name="carts" value="1" <?php checked( colvywp_wc_carts_on() ); ?>><span></span></label>
			</div>
			<details class="cw-adv">
				<summary>Advanced</summary>
				<div class="cw-field"><label for="cw-ep">Colvy endpoint</label><input id="cw-ep" type="url" name="endpoint" value="<?php echo esc_attr( colvywp_wc_endpoint() ); ?>"><p class="cw-help">Leave as is unless Colvy support asks.</p></div>
				<div class="cw-field"><label for="cw-int">Seconds between cart updates</label><input id="cw-int" type="number" min="0" name="interval" value="<?php echo esc_attr( colvywp_wc_interval() ); ?>" style="max-width:120px"></div>
			</details>
			<div style="display:flex;gap:8px;flex-wrap:wrap">
				<button name="save" value="1" class="cw-btn">Save</button>
				<button name="test" value="1" class="cw-btn cw-btn-ghost">Send a test cart</button>
			</div>
		</form>
	</div>
	</div>
	<?php
}
