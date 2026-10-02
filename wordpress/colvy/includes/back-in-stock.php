<?php
/**
 * Colvy — Back in stock.
 *
 * A "Notify me" form on sold-out WooCommerce products. Shoppers leave a mobile
 * number (or email); Colvy texts them once when it's back, and their reply
 * lands in the Colvy inbox. Sign-ups go server-to-server, so the API key never
 * reaches the browser. Loaded by colvy.php.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

/* ─────────────────────────────── Settings ─────────────────────────────── */

function colvy_bis_defaults() {
	return array(
		'enabled'   => 1,
		'placement' => 'auto',        // auto | shortcode
		'channels'  => 'sms_email',   // sms_email | email_sms | sms | email
		'ask_name'  => 0,
		'heading'   => 'Sold out — for now',
		'message'   => "Leave your number and we'll text you the moment it's back. One message, no spam.",
		'button'    => 'Notify me',
		'accent'    => '',            // blank = your Colvy brand colour
	);
}

function colvy_bis_opts() {
	$o = get_option( 'colvy_bis', array() );
	return wp_parse_args( is_array( $o ) ? $o : array(), colvy_bis_defaults() );
}

function colvy_bis_api( $method, $path, $body = null, $blocking = true ) {
	return colvywp_api( $method, $path, $body, $blocking );
}

/** Colvy summary (accent colour, waiting counts) — cached for 10 minutes. */
function colvy_bis_summary( $fresh = false ) {
	$s = $fresh ? false : get_transient( 'colvy_bis_summary' );
	if ( $s === false ) {
		$s = colvy_bis_api( 'GET', '/api/plugin/waitlist' );
		if ( is_wp_error( $s ) ) return $s;
		set_transient( 'colvy_bis_summary', $s, 10 * MINUTE_IN_SECONDS );
	}
	return $s;
}

function colvy_bis_accent() {
	$o = colvy_bis_opts();
	if ( preg_match( '/^#[0-9a-f]{6}$/i', $o['accent'] ) ) return $o['accent'];
	$s = get_transient( 'colvy_bis_summary' );
	if ( is_array( $s ) && ! empty( $s['accent_color'] ) && preg_match( '/^#[0-9a-f]{6}$/i', $s['accent_color'] ) ) return $s['accent_color'];
	return colvywp_accent();
}

/* ─────────────────────────────── Storefront ───────────────────────────── */

add_action( 'wp_enqueue_scripts', function () {
	if ( ! function_exists( 'is_product' ) ) return;
	wp_register_style( 'colvy-bis', COLVYWP_URL . 'assets/bis.css', array(), COLVYWP_VERSION );
	wp_register_script( 'colvy-bis', COLVYWP_URL . 'assets/bis.js', array(), COLVYWP_VERSION, true );
	wp_localize_script( 'colvy-bis', 'colvyBis', array( 'ajax' => admin_url( 'admin-ajax.php' ), 'me' => colvy_bis_me() ) );
	if ( is_product() ) { wp_enqueue_style( 'colvy-bis' ); wp_enqueue_script( 'colvy-bis' ); }
} );

/**
 * A logged-in shopper's own details, to prefill the form. Only for logged-in
 * visitors — those pages aren't page-cached, so nobody else sees them.
 */
function colvy_bis_me() {
	if ( ! is_user_logged_in() ) return null;
	$u = wp_get_current_user();
	$g = function ( $k ) use ( $u ) { return (string) get_user_meta( $u->ID, $k, true ); };
	if ( function_exists( 'WC' ) && class_exists( 'WC_Customer' ) ) {
		try { $c = new WC_Customer( $u->ID ); return array( 'name' => $c->get_billing_first_name() ?: $u->first_name, 'phone' => $c->get_billing_phone(), 'email' => $c->get_billing_email() ?: $u->user_email ); } catch ( Exception $e ) {}
	}
	return array( 'name' => $g( 'billing_first_name' ) ?: $u->first_name, 'phone' => $g( 'billing_phone' ), 'email' => $u->user_email );
}

function colvy_bis_icon( $name ) {
	$p = array(
		'bell'  => '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
		'phone' => '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/>',
		'mail'  => '<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 6 9 7 9-7"/>',
	);
	return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $p[ $name ] . '</svg>';
}

/** The form for one product or variation. $preview = admin preview (no submit). */
function colvy_bis_form( $product, $preview = false ) {
	$o   = colvy_bis_opts();
	$ch  = $o['channels'];
	$first = ( $ch === 'email' || $ch === 'email_sms' ) ? 'email' : 'sms';
	$both  = in_array( $ch, array( 'sms_email', 'email_sms' ), true );
	$pid   = $product ? $product->get_id() : 0;
	wp_enqueue_style( 'colvy-bis' );
	wp_enqueue_script( 'colvy-bis' );
	ob_start(); ?>
	<div class="colvy-bis" data-product="<?php echo esc_attr( $pid ); ?>" data-ch="<?php echo esc_attr( $first ); ?>"<?php echo $preview ? ' data-preview="1"' : ''; ?> style="--cbis-accent:<?php echo esc_attr( colvy_bis_accent() ); ?>">
		<div class="colvy-bis__in">
			<div class="colvy-bis__ask">
				<div class="colvy-bis__head">
					<span class="colvy-bis__icon"><?php echo colvy_bis_icon( 'bell' ); // phpcs:ignore ?></span>
					<div>
						<div class="colvy-bis__title"><?php echo esc_html( $o['heading'] ); ?></div>
						<div class="colvy-bis__sub"><?php echo esc_html( $o['message'] ); ?></div>
					</div>
				</div>
				<div class="colvy-bis__form" role="form">
					<?php if ( $both ) : ?>
					<div class="colvy-bis__seg" role="radiogroup" aria-label="How should we tell you?">
						<span class="colvy-bis__thumb" aria-hidden="true"></span>
						<?php foreach ( ( $first === 'sms' ? array( 'sms', 'email' ) : array( 'email', 'sms' ) ) as $c ) : ?>
						<button type="button" role="radio" data-ch="<?php echo esc_attr( $c ); ?>" aria-checked="<?php echo $c === $first ? 'true' : 'false'; ?>"><?php echo colvy_bis_icon( $c === 'sms' ? 'phone' : 'mail' ); // phpcs:ignore ?><span><?php echo $c === 'sms' ? 'Text me' : 'Email me'; ?></span></button>
						<?php endforeach; ?>
					</div>
					<?php endif; ?>
					<?php if ( $o['ask_name'] ) : ?>
					<label class="colvy-bis__field"><span class="screen-reader-text">First name</span><input type="text" name="name" autocomplete="given-name" placeholder="First name" maxlength="80"></label>
					<?php endif; ?>
					<div class="colvy-bis__row">
						<label class="colvy-bis__field colvy-bis__f-sms"><span class="screen-reader-text">Mobile number</span><?php echo colvy_bis_icon( 'phone' ); // phpcs:ignore ?><input type="tel" name="phone" inputmode="tel" autocomplete="tel" placeholder="Mobile number" maxlength="30"></label>
						<label class="colvy-bis__field colvy-bis__f-email"><span class="screen-reader-text">Email</span><?php echo colvy_bis_icon( 'mail' ); // phpcs:ignore ?><input type="email" name="email" inputmode="email" autocomplete="email" placeholder="Email address" maxlength="120"></label>
						<button type="button" class="colvy-bis__btn"><span class="colvy-bis__lbl"><?php echo esc_html( $o['button'] ); ?></span><span class="colvy-bis__spin" aria-hidden="true"></span></button>
					</div>
					<input type="text" name="website" class="colvy-bis__hp" tabindex="-1" autocomplete="off" aria-hidden="true">
					<p class="colvy-bis__err" role="alert" aria-live="polite"></p>
					<p class="colvy-bis__fine">We'll only message you about this item. Reply STOP to opt out.</p>
				</div>
			</div>
			<div class="colvy-bis__done" hidden>
				<div class="colvy-bis__mark" aria-hidden="true"></div>
				<div>
					<div class="colvy-bis__title colvy-bis__done-t">You're on the list</div>
					<div class="colvy-bis__sub colvy-bis__done-s"></div>
					<button type="button" class="colvy-bis__again">Use a different number</button>
				</div>
			</div>
		</div>
	</div>
	<?php
	return ob_get_clean();
}

function colvy_bis_should_show( $product ) {
	$o = colvy_bis_opts();
	if ( ! $o['enabled'] || ! $product || ! is_a( $product, 'WC_Product' ) ) return false;
	if ( is_admin() && ! wp_doing_ajax() ) return false;
	if ( $product->is_in_stock() || $product->is_type( 'variable' ) || $product->is_type( 'grouped' ) || $product->is_type( 'external' ) ) return false;
	return (bool) apply_filters( 'colvy_bis_show_form', true, $product );
}

// Under the "Out of stock" line — simple products, each variation (Woo injects
// it when that option is picked), and page-builder layouts that show stock.
$GLOBALS['colvy_bis_rendered'] = array();
add_filter( 'woocommerce_get_stock_html', function ( $html, $product ) {
	if ( colvy_bis_opts()['placement'] !== 'auto' || ! colvy_bis_should_show( $product ) ) return $html;
	$id = $product->get_id();
	if ( ! $product->is_type( 'variation' ) ) {
		if ( isset( $GLOBALS['colvy_bis_rendered'][ $id ] ) ) return $html;
		$GLOBALS['colvy_bis_rendered'][ $id ] = 1;
	}
	return $html . colvy_bis_form( $product );
}, 20, 2 );

// Fallback for themes that don't print the stock line.
add_action( 'woocommerce_single_product_summary', function () {
	global $product;
	if ( colvy_bis_opts()['placement'] !== 'auto' || ! colvy_bis_should_show( $product ) ) return;
	if ( isset( $GLOBALS['colvy_bis_rendered'][ $product->get_id() ] ) ) return;
	$GLOBALS['colvy_bis_rendered'][ $product->get_id() ] = 1;
	echo colvy_bis_form( $product ); // phpcs:ignore
}, 31 );

// [colvy_back_in_stock] or [colvy_back_in_stock id="123"]
add_shortcode( 'colvy_back_in_stock', function ( $atts ) {
	$atts    = shortcode_atts( array( 'id' => 0 ), $atts );
	$product = $atts['id'] ? wc_get_product( absint( $atts['id'] ) ) : ( isset( $GLOBALS['product'] ) ? $GLOBALS['product'] : null );
	if ( ! colvy_bis_should_show( $product ) ) return '';
	$GLOBALS['colvy_bis_rendered'][ $product->get_id() ] = 1;
	return colvy_bis_form( $product );
} );

/* ─────────────────────────────── Sign-up (AJAX) ────────────────────────── */

function colvy_bis_join() {
	// Bots fill every field; people never see this one.
	if ( ! empty( $_POST['website'] ) ) wp_send_json_success( array( 'via' => 'sms' ) );

	$ip    = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	$rk    = 'colvy_bis_rl_' . md5( $ip );
	$tries = (int) get_transient( $rk );
	if ( $tries >= 10 ) wp_send_json_error( array( 'message' => 'Too many tries — please wait a few minutes.' ), 429 );
	set_transient( $rk, $tries + 1, 10 * MINUTE_IN_SECONDS );

	$product = wc_get_product( isset( $_POST['product'] ) ? absint( $_POST['product'] ) : 0 );
	if ( ! $product ) wp_send_json_error( array( 'message' => 'That product couldn’t be found.' ), 400 );

	$ch    = ( isset( $_POST['ch'] ) && $_POST['ch'] === 'email' ) ? 'email' : 'sms';
	$phone = $ch === 'sms' && isset( $_POST['phone'] ) ? sanitize_text_field( wp_unslash( $_POST['phone'] ) ) : '';
	$email = $ch === 'email' && isset( $_POST['email'] ) ? sanitize_email( wp_unslash( $_POST['email'] ) ) : '';
	$name  = isset( $_POST['name'] ) ? sanitize_text_field( wp_unslash( $_POST['name'] ) ) : '';
	if ( $ch === 'sms' && strlen( preg_replace( '/\D/', '', $phone ) ) < 8 ) wp_send_json_error( array( 'message' => 'Enter your mobile number.' ), 400 );
	if ( $ch === 'email' && ! is_email( $email ) ) wp_send_json_error( array( 'message' => 'Enter a valid email address.' ), 400 );

	$parent = $product->is_type( 'variation' ) ? wc_get_product( $product->get_parent_id() ) : null;
	$img_id = $product->get_image_id() ?: ( $parent ? $parent->get_image_id() : 0 );
	$res = colvy_bis_api( 'POST', '/api/plugin/waitlist', array(
		'action'        => 'join',
		'product_id'    => $parent ? $parent->get_id() : $product->get_id(),
		'variation_id'  => $parent ? $product->get_id() : null,
		'product_name'  => wp_strip_all_tags( $product->get_name() ),
		'product_url'   => $product->get_permalink(),
		'product_image' => $img_id ? wp_get_attachment_image_url( $img_id, 'woocommerce_thumbnail' ) : '',
		'name'          => $name,
		'phone'         => $phone,
		'email'         => $email,
	) );
	if ( is_wp_error( $res ) ) {
		$msg = strpos( $res->get_error_code(), 'colvy_http_4' ) === 0 && $res->get_error_code() !== 'colvy_http_401' ? $res->get_error_message() : 'Something went wrong — please try again.';
		wp_send_json_error( array( 'message' => $msg ), 400 );
	}
	delete_transient( 'colvy_bis_summary' );
	wp_send_json_success( array( 'via' => $ch, 'duplicate' => ! empty( $res['duplicate'] ) ) );
}
add_action( 'wp_ajax_colvy_bis_join', 'colvy_bis_join' );
add_action( 'wp_ajax_nopriv_colvy_bis_join', 'colvy_bis_join' );

/* ─────────────────── Back in stock → tell Colvy straight away ───────────── */
// Colvy also hears this from the WooCommerce webhook; whichever arrives first
// sends the texts and the other finds nobody left waiting.

$GLOBALS['colvy_bis_restocked'] = array();
function colvy_bis_restocked( $id, $status, $product = null ) {
	if ( $status !== 'instock' ) return;
	$GLOBALS['colvy_bis_restocked'][ (int) $id ] = 1;
	$p = $product ?: wc_get_product( $id );
	if ( $p && $p->get_parent_id() ) $GLOBALS['colvy_bis_restocked'][ (int) $p->get_parent_id() ] = 1;
}
add_action( 'woocommerce_product_set_stock_status', 'colvy_bis_restocked', 10, 3 );
add_action( 'woocommerce_variation_set_stock_status', 'colvy_bis_restocked', 10, 3 );
add_action( 'shutdown', function () {
	if ( empty( $GLOBALS['colvy_bis_restocked'] ) || ! colvy_bis_opts()['enabled'] ) return;
	colvy_bis_api( 'POST', '/api/plugin/waitlist', array( 'action' => 'stock', 'product_ids' => array_keys( $GLOBALS['colvy_bis_restocked'] ) ), false );
} );

/* ─────────────────────────────── Admin page ───────────────────────────── */

add_action( 'admin_init', function () {
	register_setting( 'colvy_bis', 'colvy_bis', array( 'sanitize_callback' => function ( $in ) {
		$d  = colvy_bis_defaults();
		$in = is_array( $in ) ? $in : array();
		delete_transient( 'colvy_bis_summary' );
		return array(
			'enabled'   => empty( $in['enabled'] ) ? 0 : 1,
			'placement' => isset( $in['placement'] ) && $in['placement'] === 'shortcode' ? 'shortcode' : 'auto',
			'channels'  => isset( $in['channels'] ) && in_array( $in['channels'], array( 'sms_email', 'email_sms', 'sms', 'email' ), true ) ? $in['channels'] : 'sms_email',
			'ask_name'  => empty( $in['ask_name'] ) ? 0 : 1,
			'heading'   => isset( $in['heading'] ) && trim( $in['heading'] ) !== '' ? sanitize_text_field( $in['heading'] ) : $d['heading'],
			'message'   => isset( $in['message'] ) && trim( $in['message'] ) !== '' ? sanitize_textarea_field( $in['message'] ) : $d['message'],
			'button'    => isset( $in['button'] ) && trim( $in['button'] ) !== '' ? sanitize_text_field( $in['button'] ) : $d['button'],
			'accent'    => isset( $in['accent'] ) && preg_match( '/^#[0-9a-f]{6}$/i', $in['accent'] ) ? $in['accent'] : '',
		);
	} ) );
} );

function colvy_bis_admin_page() {
	if ( ! current_user_can( 'manage_options' ) ) return;
	$o   = colvy_bis_opts();
	$f   = 'colvy_bis';
	echo '<div class="wrap cw">';
	$acc = colvywp_header( 'colvy-back-in-stock', 'A “Notify me” form on sold-out products. Colvy texts them once when it’s back.' );
	$sum = colvywp_connected() ? colvy_bis_summary( isset( $_GET['settings-updated'] ) ) : new WP_Error( 'x', 'Not connected' ); // phpcs:ignore
	$ok  = ! is_wp_error( $sum );
	if ( isset( $_GET['settings-updated'] ) ) colvywp_notice( 'ok', 'Saved.' ); // phpcs:ignore
	if ( ! colvywp_connected() ) colvywp_notice( 'warn', 'Connect Colvy first, under <a href="' . esc_url( admin_url( 'admin.php?page=colvy-settings' ) ) . '">Connection</a> — sign-ups go straight into Colvy.' );
	elseif ( ! $ok ) colvywp_notice( 'warn', 'Couldn’t reach Colvy: ' . esc_html( $sum->get_error_message() ) );
	elseif ( ! empty( $sum['needsMigration'] ) ) colvywp_notice( 'warn', 'Waitlists aren’t switched on in your Colvy workspace yet.' );
	if ( ! class_exists( 'WooCommerce' ) ) colvywp_notice( 'warn', 'WooCommerce isn’t active — the form shows on WooCommerce products.' );
	?>
	<div class="cw-tiles cw-tiles-3">
		<div class="cw-tile" style="--c:#f59e0b"><span class="cw-tile-ic"><?php echo colvywp_i( 'bell', 18 ); // phpcs:ignore ?></span><span class="cw-tile-k">Waiting now</span><span class="cw-tile-v"><?php echo $ok && empty( $sum['needsMigration'] ) ? esc_html( number_format_i18n( (int) $sum['waiting'] ) ) : '—'; ?></span></div>
		<div class="cw-tile" style="--c:#22c55e"><span class="cw-tile-ic"><?php echo colvywp_i( 'check', 18 ); // phpcs:ignore ?></span><span class="cw-tile-k">Told it's back · 30 days</span><span class="cw-tile-v"><?php echo $ok && empty( $sum['needsMigration'] ) ? esc_html( number_format_i18n( (int) $sum['notified_30d'] ) ) : '—'; ?></span></div>
		<div class="cw-tile" style="--c:#0ea5e9"><span class="cw-tile-ic"><?php echo colvywp_i( 'chat', 18 ); // phpcs:ignore ?></span><span class="cw-tile-k">Auto-text when back</span><span class="cw-tile-v cw-tile-v-s"><?php echo $ok ? ( ! empty( $sum['auto_notify'] ) ? 'On' : 'Off — send from Colvy' ) : '—'; ?></span></div>
	</div>

	<div class="cw-grid2">
		<form method="post" action="options.php" class="cw-card cw-form">
			<?php settings_fields( 'colvy_bis' ); ?>
			<div class="cw-row">
				<div><b>Show the form on sold-out products</b><p class="cw-help">Simple products and each sold-out variation.</p></div>
				<label class="cw-switch"><input type="checkbox" name="<?php echo $f; ?>[enabled]" value="1" <?php checked( $o['enabled'] ); ?>><span></span></label>
			</div>
			<div class="cw-field"><label>Where</label>
				<div class="cw-seg">
					<label><input type="radio" name="<?php echo $f; ?>[placement]" value="auto" <?php checked( $o['placement'], 'auto' ); ?>><span>Under “Out of stock”</span></label>
					<label><input type="radio" name="<?php echo $f; ?>[placement]" value="shortcode" <?php checked( $o['placement'], 'shortcode' ); ?>><span>Shortcode only</span></label>
				</div>
				<p class="cw-help">Shortcode for page builders: <code>[colvy_back_in_stock]</code></p>
			</div>
			<div class="cw-field"><label for="cbis-ch">Ask for</label>
				<select id="cbis-ch" name="<?php echo $f; ?>[channels]">
					<?php foreach ( array( 'sms_email' => 'Mobile, or email', 'email_sms' => 'Email, or mobile', 'sms' => 'Mobile only', 'email' => 'Email only' ) as $k => $l ) : ?>
					<option value="<?php echo esc_attr( $k ); ?>" <?php selected( $o['channels'], $k ); ?>><?php echo esc_html( $l ); ?></option>
					<?php endforeach; ?>
				</select>
				<label class="cw-check"><input type="checkbox" name="<?php echo $f; ?>[ask_name]" value="1" <?php checked( $o['ask_name'] ); ?>> Also ask for their first name</label>
			</div>
			<div class="cw-field"><label for="cbis-h">Heading</label><input id="cbis-h" type="text" name="<?php echo $f; ?>[heading]" value="<?php echo esc_attr( $o['heading'] ); ?>"></div>
			<div class="cw-field"><label for="cbis-m">Message</label><textarea id="cbis-m" rows="2" name="<?php echo $f; ?>[message]"><?php echo esc_textarea( $o['message'] ); ?></textarea></div>
			<div class="cw-field cw-2col">
				<div><label for="cbis-b">Button</label><input id="cbis-b" type="text" name="<?php echo $f; ?>[button]" value="<?php echo esc_attr( $o['button'] ); ?>"></div>
				<div><label for="cbis-a">Button colour</label><input id="cbis-a" type="text" name="<?php echo $f; ?>[accent]" value="<?php echo esc_attr( $o['accent'] ); ?>" placeholder="<?php echo esc_attr( colvy_bis_accent() ); ?> (brand)" pattern="#[0-9a-fA-F]{6}"></div>
			</div>
			<button type="submit" class="cw-btn">Save</button>
			<p class="cw-help" style="margin-top:14px">Using another back-in-stock or waitlist plugin (or WoodMart's built-in waitlist)? Switch it off so shoppers don't see two forms. The text customers get is set in Colvy → Waitlists.</p>
		</form>

		<div class="cw-side">
			<div class="cw-card">
				<div class="cw-k">Preview — try it</div>
				<div class="cw-preview-wrap"><?php echo colvy_bis_form( null, true ); // phpcs:ignore ?></div>
			</div>
			<div class="cw-card">
				<div class="cw-k">Most wanted</div>
				<?php if ( $ok && ! empty( $sum['top'] ) ) : ?>
					<ul class="cw-toplist">
					<?php foreach ( $sum['top'] as $t ) : ?>
						<li><span><?php echo esc_html( $t['item'] ); ?></span><b><?php echo esc_html( (int) $t['waiting'] ); ?> waiting</b></li>
					<?php endforeach; ?>
					</ul>
				<?php else : ?>
					<p class="cw-help">Nobody's waiting yet. Sign-ups appear here and in Colvy → Waitlists.</p>
				<?php endif; ?>
				<?php $app = $acc && ! is_wp_error( $acc ) && ! empty( $acc['company']['app_url'] ) ? $acc['company']['app_url'] : 'https://colvy.com/admin'; ?>
				<a class="cw-btn cw-btn-ghost" href="<?php echo esc_url( $app . '/waitlists' ); ?>" target="_blank" rel="noopener">Open waitlists in Colvy <?php echo colvywp_i( 'ext', 14 ); // phpcs:ignore ?></a>
			</div>
		</div>
	</div>
	</div>
	<?php
}
