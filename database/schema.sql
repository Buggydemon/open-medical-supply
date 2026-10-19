BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA medical_supply;
REVOKE ALL ON SCHEMA medical_supply FROM PUBLIC;

CREATE TABLE medical_supply.currencies (
    code text PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
    minor_unit_exponent smallint NOT NULL CHECK (minor_unit_exponent BETWEEN 0 AND 4)
);

CREATE TABLE medical_supply.measurement_units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE CHECK (length(code) BETWEEN 1 AND 32),
    display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),
    dimension text NOT NULL CHECK (dimension IN ('mass', 'volume', 'activity', 'count'))
);

CREATE TABLE medical_supply.dosage_forms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE CHECK (length(code) BETWEEN 1 AND 48),
    display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120)
);

CREATE TABLE medical_supply.administration_routes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE CHECK (length(code) BETWEEN 1 AND 48),
    display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120)
);

CREATE TABLE medical_supply.nigerian_states (
    code text PRIMARY KEY CHECK (code ~ '^[A-Z]{2,3}$'),
    name text NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 1 AND 80)
);

CREATE TABLE medical_supply.local_government_areas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    state_code text NOT NULL REFERENCES medical_supply.nigerian_states(code),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    UNIQUE (state_code, name),
    UNIQUE (id, state_code)
);

CREATE TABLE medical_supply.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('manufacturer', 'distributor', 'pharmacy', 'regulator')),
    legal_name text NOT NULL CHECK (length(btrim(legal_name)) BETWEEN 1 AND 240),
    country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, kind)
);

CREATE TABLE medical_supply.manufacturers (
    id uuid PRIMARY KEY REFERENCES medical_supply.organizations(id),
    organization_kind text NOT NULL DEFAULT 'manufacturer' CHECK (organization_kind = 'manufacturer'),
    public_website text CHECK (public_website IS NULL OR length(public_website) <= 2048),
    FOREIGN KEY (id, organization_kind) REFERENCES medical_supply.organizations(id, kind)
);

CREATE TABLE medical_supply.regulatory_authorities (
    id uuid PRIMARY KEY REFERENCES medical_supply.organizations(id),
    organization_kind text NOT NULL DEFAULT 'regulator' CHECK (organization_kind = 'regulator'),
    authority_code text NOT NULL UNIQUE CHECK (length(authority_code) BETWEEN 1 AND 48),
    FOREIGN KEY (id, organization_kind) REFERENCES medical_supply.organizations(id, kind)
);

CREATE TABLE medical_supply.pharmacies (
    id uuid PRIMARY KEY REFERENCES medical_supply.organizations(id),
    organization_kind text NOT NULL DEFAULT 'pharmacy' CHECK (organization_kind = 'pharmacy'),
    display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 180),
    street_address text NOT NULL CHECK (length(btrim(street_address)) BETWEEN 1 AND 300),
    state_code text NOT NULL REFERENCES medical_supply.nigerian_states(code),
    lga_id uuid NOT NULL,
    locality text CHECK (locality IS NULL OR length(btrim(locality)) BETWEEN 1 AND 120),
    latitude numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
    longitude numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
    timezone text NOT NULL DEFAULT 'Africa/Lagos' CHECK (timezone = 'Africa/Lagos'),
    public_phone text CHECK (public_phone IS NULL OR public_phone ~ '^\+[1-9][0-9]{7,14}$'),
    listing_status text NOT NULL DEFAULT 'pending_review'
        CHECK (listing_status IN ('pending_review', 'published', 'suspended', 'closed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (id, organization_kind) REFERENCES medical_supply.organizations(id, kind),
    FOREIGN KEY (lga_id, state_code) REFERENCES medical_supply.local_government_areas(id, state_code),
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CHECK (updated_at >= created_at)
);
CREATE INDEX pharmacies_location_idx ON medical_supply.pharmacies (state_code, lga_id, listing_status);
CREATE INDEX pharmacies_coordinates_idx ON medical_supply.pharmacies (latitude, longitude)
    WHERE listing_status = 'published';

CREATE TABLE medical_supply.pharmacy_opening_hours (
    pharmacy_id uuid NOT NULL REFERENCES medical_supply.pharmacies(id),
    weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    interval_number smallint NOT NULL DEFAULT 1 CHECK (interval_number > 0),
    opens_at time NOT NULL,
    closes_at time NOT NULL,
    PRIMARY KEY (pharmacy_id, weekday, interval_number),
    CHECK (closes_at > opens_at)
);

CREATE TABLE medical_supply.app_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_issuer text CHECK (auth_issuer IS NULL OR length(btrim(auth_issuer)) BETWEEN 1 AND 512),
    auth_subject text CHECK (auth_subject IS NULL OR length(btrim(auth_subject)) BETWEEN 1 AND 255),
    display_name text CHECK (display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 120),
    account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deleted')),
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (auth_issuer, auth_subject),
    CHECK ((auth_issuer IS NULL) = (auth_subject IS NULL)),
    CHECK (
        (account_status <> 'deleted' AND auth_issuer IS NOT NULL AND deleted_at IS NULL)
        OR (account_status = 'deleted' AND auth_issuer IS NULL AND display_name IS NULL
            AND deleted_at IS NOT NULL AND deleted_at >= created_at)
    )
);

CREATE TABLE medical_supply.app_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE CHECK (code IN ('patient', 'pharmacy', 'regulator', 'administrator'))
);

CREATE TABLE medical_supply.user_roles (
    user_id uuid NOT NULL REFERENCES medical_supply.app_users(id),
    role_id uuid NOT NULL REFERENCES medical_supply.app_roles(id),
    granted_by uuid REFERENCES medical_supply.app_users(id),
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);
CREATE INDEX user_roles_role_idx ON medical_supply.user_roles (role_id, user_id);

CREATE TABLE medical_supply.pharmacy_memberships (
    pharmacy_id uuid NOT NULL REFERENCES medical_supply.pharmacies(id),
    user_id uuid NOT NULL REFERENCES medical_supply.app_users(id),
    membership_role text NOT NULL CHECK (membership_role IN ('owner', 'manager', 'inventory_staff')),
    status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
    granted_by uuid REFERENCES medical_supply.app_users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (pharmacy_id, user_id)
);
CREATE INDEX pharmacy_memberships_user_idx ON medical_supply.pharmacy_memberships (user_id, status);

CREATE TABLE medical_supply.regulator_memberships (
    authority_id uuid NOT NULL REFERENCES medical_supply.regulatory_authorities(id),
    user_id uuid NOT NULL REFERENCES medical_supply.app_users(id),
    membership_role text NOT NULL CHECK (membership_role IN ('reviewer', 'supervisor')),
    status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'suspended', 'revoked')),
    granted_by uuid REFERENCES medical_supply.app_users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (authority_id, user_id)
);
CREATE INDEX regulator_memberships_user_idx ON medical_supply.regulator_memberships (user_id, status);

CREATE TABLE medical_supply.active_ingredients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    international_name text NOT NULL CHECK (length(btrim(international_name)) BETWEEN 1 AND 240),
    normalized_name text NOT NULL UNIQUE CHECK (length(btrim(normalized_name)) BETWEEN 1 AND 240)
);

CREATE TABLE medical_supply.generic_medicines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    generic_name text NOT NULL CHECK (length(btrim(generic_name)) BETWEEN 1 AND 240),
    normalized_name text NOT NULL UNIQUE CHECK (length(btrim(normalized_name)) BETWEEN 1 AND 240)
);

CREATE TABLE medical_supply.medicine_formulations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    generic_medicine_id uuid NOT NULL REFERENCES medical_supply.generic_medicines(id),
    dosage_form_id uuid NOT NULL REFERENCES medical_supply.dosage_forms(id),
    administration_route_id uuid NOT NULL REFERENCES medical_supply.administration_routes(id),
    formulation_key text NOT NULL UNIQUE CHECK (length(formulation_key) BETWEEN 1 AND 256),
    release_type text NOT NULL DEFAULT 'unspecified'
        CHECK (release_type IN ('unspecified', 'immediate', 'modified', 'delayed', 'extended')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX medicine_formulations_generic_idx ON medical_supply.medicine_formulations (generic_medicine_id, dosage_form_id);

CREATE TABLE medical_supply.formulation_ingredients (
    formulation_id uuid NOT NULL REFERENCES medical_supply.medicine_formulations(id),
    ingredient_id uuid NOT NULL REFERENCES medical_supply.active_ingredients(id),
    strength_amount numeric(18,6) NOT NULL CHECK (strength_amount > 0),
    strength_unit_id uuid NOT NULL REFERENCES medical_supply.measurement_units(id),
    denominator_amount numeric(18,6),
    denominator_unit_id uuid REFERENCES medical_supply.measurement_units(id),
    PRIMARY KEY (formulation_id, ingredient_id),
    CHECK (
        (denominator_amount IS NULL AND denominator_unit_id IS NULL)
        OR (denominator_amount IS NOT NULL AND denominator_amount > 0 AND denominator_unit_id IS NOT NULL)
    )
);
CREATE INDEX formulation_ingredients_ingredient_idx ON medical_supply.formulation_ingredients (ingredient_id);

CREATE TABLE medical_supply.medicine_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    formulation_id uuid NOT NULL REFERENCES medical_supply.medicine_formulations(id),
    manufacturer_id uuid NOT NULL REFERENCES medical_supply.manufacturers(id),
    brand_name text CHECK (brand_name IS NULL OR length(btrim(brand_name)) BETWEEN 1 AND 180),
    normalized_brand_name text CHECK (normalized_brand_name IS NULL OR length(btrim(normalized_brand_name)) BETWEEN 1 AND 180),
    prescription_status text NOT NULL DEFAULT 'unknown'
        CHECK (prescription_status IN ('unknown', 'prescription_required', 'non_prescription')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (manufacturer_id, formulation_id, normalized_brand_name),
    UNIQUE (id, manufacturer_id),
    CHECK ((brand_name IS NULL) = (normalized_brand_name IS NULL))
);
CREATE INDEX medicine_products_formulation_idx ON medical_supply.medicine_products (formulation_id);
CREATE INDEX medicine_products_brand_idx ON medical_supply.medicine_products (normalized_brand_name);

CREATE TABLE medical_supply.sale_packages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES medical_supply.medicine_products(id),
    package_label text NOT NULL CHECK (length(btrim(package_label)) BETWEEN 1 AND 180),
    base_quantity numeric(18,6) NOT NULL CHECK (base_quantity > 0),
    base_unit_id uuid NOT NULL REFERENCES medical_supply.measurement_units(id),
    gtin text UNIQUE CHECK (gtin IS NULL OR gtin ~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$'),
    UNIQUE (product_id, package_label, base_quantity, base_unit_id),
    UNIQUE (id, product_id)
);

CREATE TABLE medical_supply.regulatory_registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES medical_supply.medicine_products(id),
    authority_id uuid NOT NULL REFERENCES medical_supply.regulatory_authorities(id),
    registration_number text NOT NULL CHECK (length(btrim(registration_number)) BETWEEN 1 AND 120),
    issued_on date,
    expires_on date,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (authority_id, registration_number),
    CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX regulatory_registrations_product_idx ON medical_supply.regulatory_registrations (product_id);

CREATE TABLE medical_supply.regulatory_verification_checks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id uuid NOT NULL REFERENCES medical_supply.regulatory_registrations(id),
    status text NOT NULL DEFAULT 'not_checked'
        CHECK (status IN ('not_checked', 'pending', 'registered', 'not_found', 'expired', 'suspended', 'revoked', 'inconclusive')),
    source_type text NOT NULL DEFAULT 'self_reported'
        CHECK (source_type IN ('self_reported', 'official_registry', 'official_manual_review')),
    evidence_reference text CHECK (evidence_reference IS NULL OR length(btrim(evidence_reference)) BETWEEN 1 AND 2048),
    checked_by uuid REFERENCES medical_supply.app_users(id),
    checked_at timestamptz NOT NULL DEFAULT now(),
    valid_until timestamptz,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_until IS NULL OR valid_until > checked_at),
    CHECK (recorded_at >= checked_at),
    CHECK (
        status NOT IN ('registered', 'expired', 'suspended', 'revoked', 'not_found')
        OR (source_type IN ('official_registry', 'official_manual_review') AND evidence_reference IS NOT NULL)
    ),
    CHECK (source_type <> 'official_manual_review' OR checked_by IS NOT NULL)
);
CREATE INDEX regulatory_verification_latest_idx ON medical_supply.regulatory_verification_checks (registration_id, checked_at DESC, recorded_at DESC);

CREATE TABLE medical_supply.pharmacy_licenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid NOT NULL REFERENCES medical_supply.pharmacies(id),
    authority_id uuid NOT NULL REFERENCES medical_supply.regulatory_authorities(id),
    license_number text NOT NULL CHECK (length(btrim(license_number)) BETWEEN 1 AND 120),
    issued_on date,
    expires_on date,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (authority_id, license_number),
    CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
);
CREATE INDEX pharmacy_licenses_pharmacy_idx ON medical_supply.pharmacy_licenses (pharmacy_id);

CREATE TABLE medical_supply.license_verification_checks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id uuid NOT NULL REFERENCES medical_supply.pharmacy_licenses(id),
    status text NOT NULL DEFAULT 'unverified'
        CHECK (status IN ('unverified', 'pending', 'verified', 'rejected', 'expired', 'suspended', 'revoked', 'inconclusive')),
    source_type text NOT NULL DEFAULT 'self_reported'
        CHECK (source_type IN ('self_reported', 'official_registry', 'official_manual_review')),
    evidence_reference text CHECK (evidence_reference IS NULL OR length(btrim(evidence_reference)) BETWEEN 1 AND 2048),
    checked_by uuid REFERENCES medical_supply.app_users(id),
    checked_at timestamptz NOT NULL DEFAULT now(),
    valid_until timestamptz,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_until IS NULL OR valid_until > checked_at),
    CHECK (recorded_at >= checked_at),
    CHECK (
        status NOT IN ('verified', 'rejected', 'expired', 'suspended', 'revoked')
        OR (source_type IN ('official_registry', 'official_manual_review') AND evidence_reference IS NOT NULL)
    ),
    CHECK (source_type <> 'official_manual_review' OR checked_by IS NOT NULL)
);
CREATE INDEX license_verification_latest_idx ON medical_supply.license_verification_checks (license_id, checked_at DESC, recorded_at DESC);

CREATE TABLE medical_supply.batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    manufacturer_id uuid NOT NULL REFERENCES medical_supply.manufacturers(id),
    batch_number text NOT NULL CHECK (length(btrim(batch_number)) BETWEEN 1 AND 120),
    manufacturer_serial_hash bytea CHECK (manufacturer_serial_hash IS NULL OR octet_length(manufacturer_serial_hash) = 32),
    manufactured_on date,
    expires_on date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (product_id, manufacturer_id) REFERENCES medical_supply.medicine_products(id, manufacturer_id),
    UNIQUE (manufacturer_id, product_id, batch_number),
    UNIQUE (manufacturer_id, manufacturer_serial_hash),
    UNIQUE (id, product_id),
    UNIQUE (id, manufacturer_id),
    CHECK (manufactured_on IS NULL OR expires_on >= manufactured_on)
);
CREATE INDEX batches_product_expiry_idx ON medical_supply.batches (product_id, expires_on);

CREATE TABLE medical_supply.serialized_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL,
    manufacturer_id uuid NOT NULL REFERENCES medical_supply.manufacturers(id),
    manufacturer_serial_hash bytea NOT NULL CHECK (octet_length(manufacturer_serial_hash) = 32),
    hash_algorithm text NOT NULL DEFAULT 'sha256' CHECK (hash_algorithm = 'sha256'),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (batch_id, manufacturer_id) REFERENCES medical_supply.batches(id, manufacturer_id),
    UNIQUE (manufacturer_id, manufacturer_serial_hash),
    UNIQUE (id, batch_id)
);
CREATE INDEX serialized_items_batch_idx ON medical_supply.serialized_items (batch_id);

CREATE TABLE medical_supply.supply_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES medical_supply.batches(id),
    serialized_item_id uuid,
    event_sequence bigint NOT NULL CHECK (event_sequence > 0),
    event_type text NOT NULL CHECK (event_type IN (
        'manufactured', 'dispatched', 'received', 'transfer_observed', 'quarantined',
        'recall_reported', 'destroyed', 'correction'
    )),
    from_organization_id uuid REFERENCES medical_supply.organizations(id),
    to_organization_id uuid REFERENCES medical_supply.organizations(id),
    recorded_by uuid NOT NULL REFERENCES medical_supply.app_users(id),
    source_type text NOT NULL CHECK (source_type IN (
        'self_reported', 'manufacturer_attested', 'receiver_confirmed', 'regulator_observed'
    )),
    occurred_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    previous_event_sequence bigint,
    previous_event_hash bytea CHECK (previous_event_hash IS NULL OR octet_length(previous_event_hash) = 32),
    event_hash bytea NOT NULL CHECK (octet_length(event_hash) = 32),
    corrects_event_id uuid,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16384),
    FOREIGN KEY (serialized_item_id, batch_id) REFERENCES medical_supply.serialized_items(id, batch_id),
    UNIQUE (id, batch_id),
    UNIQUE (batch_id, event_sequence),
    UNIQUE (batch_id, event_hash),
    UNIQUE (batch_id, event_sequence, event_hash),
    FOREIGN KEY (batch_id, previous_event_sequence, previous_event_hash)
        REFERENCES medical_supply.supply_events(batch_id, event_sequence, event_hash),
    FOREIGN KEY (corrects_event_id, batch_id) REFERENCES medical_supply.supply_events(id, batch_id),
    CHECK (
        (event_sequence = 1 AND previous_event_sequence IS NULL AND previous_event_hash IS NULL)
        OR (event_sequence > 1 AND previous_event_sequence IS NOT NULL
            AND previous_event_sequence = event_sequence - 1 AND previous_event_hash IS NOT NULL)
    ),
    CHECK ((event_type = 'correction') = (corrects_event_id IS NOT NULL)),
    CHECK (corrects_event_id IS NULL OR corrects_event_id <> id),
    CHECK (from_organization_id IS NULL OR to_organization_id IS NULL OR from_organization_id <> to_organization_id),
    CHECK (event_type NOT IN ('dispatched', 'received', 'transfer_observed')
        OR (from_organization_id IS NOT NULL AND to_organization_id IS NOT NULL)),
    CHECK (recorded_at >= occurred_at)
);
CREATE INDEX supply_events_item_idx ON medical_supply.supply_events (serialized_item_id, event_sequence);
CREATE INDEX supply_events_recipient_idx ON medical_supply.supply_events (to_organization_id, recorded_at DESC);
CREATE INDEX supply_events_sender_idx ON medical_supply.supply_events (from_organization_id, recorded_at DESC);
CREATE INDEX supply_events_actor_idx ON medical_supply.supply_events (recorded_by, recorded_at DESC);
CREATE INDEX supply_events_correction_idx ON medical_supply.supply_events (corrects_event_id) WHERE corrects_event_id IS NOT NULL;

CREATE TABLE medical_supply.inventory (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id uuid NOT NULL REFERENCES medical_supply.pharmacies(id),
    product_id uuid NOT NULL REFERENCES medical_supply.medicine_products(id),
    sale_package_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    quantity_on_hand bigint NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    quantity_reserved bigint NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
    price_minor_units bigint NOT NULL CHECK (price_minor_units >= 0),
    currency_code text NOT NULL REFERENCES medical_supply.currencies(code),
    record_status text NOT NULL DEFAULT 'active' CHECK (record_status IN ('active', 'withdrawn', 'quarantined')),
    source_type text NOT NULL CHECK (source_type IN ('pharmacy_report', 'inventory_import', 'physical_audit')),
    observed_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL REFERENCES medical_supply.app_users(id),
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    FOREIGN KEY (sale_package_id, product_id) REFERENCES medical_supply.sale_packages(id, product_id),
    FOREIGN KEY (batch_id, product_id) REFERENCES medical_supply.batches(id, product_id),
    UNIQUE (pharmacy_id, sale_package_id, batch_id),
    UNIQUE (id, pharmacy_id),
    CHECK (quantity_reserved <= quantity_on_hand),
    CHECK (recorded_at >= observed_at)
);
CREATE INDEX inventory_search_idx ON medical_supply.inventory (product_id, pharmacy_id, observed_at DESC)
    WHERE record_status = 'active';
CREATE INDEX inventory_package_idx ON medical_supply.inventory (sale_package_id);
CREATE INDEX inventory_batch_idx ON medical_supply.inventory (batch_id);
CREATE INDEX inventory_freshness_idx ON medical_supply.inventory (observed_at);
CREATE INDEX inventory_updated_by_idx ON medical_supply.inventory (updated_by);

CREATE TABLE medical_supply.inventory_observations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id uuid NOT NULL REFERENCES medical_supply.inventory(id),
    inventory_version bigint NOT NULL CHECK (inventory_version > 0),
    quantity_on_hand bigint NOT NULL CHECK (quantity_on_hand >= 0),
    quantity_reserved bigint NOT NULL CHECK (quantity_reserved BETWEEN 0 AND quantity_on_hand),
    price_minor_units bigint NOT NULL CHECK (price_minor_units >= 0),
    currency_code text NOT NULL REFERENCES medical_supply.currencies(code),
    record_status text NOT NULL CHECK (record_status IN ('active', 'withdrawn', 'quarantined')),
    source_type text NOT NULL CHECK (source_type IN ('pharmacy_report', 'inventory_import', 'physical_audit')),
    recorded_by uuid NOT NULL REFERENCES medical_supply.app_users(id),
    observed_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (inventory_id, inventory_version),
    CHECK (recorded_at >= observed_at)
);
CREATE INDEX inventory_observations_latest_idx ON medical_supply.inventory_observations (inventory_id, observed_at DESC);
CREATE INDEX inventory_observations_actor_idx ON medical_supply.inventory_observations (recorded_by);

CREATE TABLE medical_supply.stock_confirmations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id uuid NOT NULL REFERENCES medical_supply.inventory(id),
    reporter_user_id uuid REFERENCES medical_supply.app_users(id) ON DELETE SET NULL,
    confirmation_type text NOT NULL CHECK (confirmation_type IN ('seen_available', 'pickup_completed')),
    moderation_status text NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'accepted', 'rejected')),
    observed_at timestamptz NOT NULL,
    submitted_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CHECK (submitted_at >= observed_at),
    CHECK (expires_at > submitted_at)
);
CREATE INDEX stock_confirmations_inventory_idx ON medical_supply.stock_confirmations (inventory_id, submitted_at DESC);
CREATE INDEX stock_confirmations_reporter_idx ON medical_supply.stock_confirmations (reporter_user_id, submitted_at DESC);
CREATE INDEX stock_confirmations_expiry_idx ON medical_supply.stock_confirmations (expires_at);

CREATE TABLE medical_supply.conflict_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id uuid REFERENCES medical_supply.inventory(id),
    pharmacy_id uuid NOT NULL REFERENCES medical_supply.pharmacies(id),
    reporter_user_id uuid REFERENCES medical_supply.app_users(id) ON DELETE SET NULL,
    report_type text NOT NULL CHECK (report_type IN (
        'unavailable', 'quantity_mismatch', 'price_mismatch', 'closed', 'location_mismatch', 'suspected_safety_issue'
    )),
    observed_price_minor_units bigint CHECK (observed_price_minor_units >= 0),
    observed_currency_code text REFERENCES medical_supply.currencies(code),
    private_details text CHECK (private_details IS NULL OR length(private_details) <= 1000),
    moderation_status text NOT NULL DEFAULT 'pending'
        CHECK (moderation_status IN ('pending', 'investigating', 'resolved', 'rejected')),
    reviewed_by uuid REFERENCES medical_supply.app_users(id),
    reviewed_at timestamptz,
    observed_at timestamptz NOT NULL,
    submitted_at timestamptz NOT NULL DEFAULT now(),
    retention_until timestamptz NOT NULL,
    FOREIGN KEY (inventory_id, pharmacy_id) REFERENCES medical_supply.inventory(id, pharmacy_id),
    CHECK ((observed_price_minor_units IS NULL) = (observed_currency_code IS NULL)),
    CHECK (report_type <> 'price_mismatch' OR observed_price_minor_units IS NOT NULL),
    CHECK (report_type NOT IN ('unavailable', 'quantity_mismatch', 'price_mismatch') OR inventory_id IS NOT NULL),
    CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
    CHECK (reviewed_at IS NULL OR reviewed_at >= submitted_at),
    CHECK (submitted_at >= observed_at),
    CHECK (retention_until > submitted_at)
);
CREATE INDEX conflict_reports_triage_idx ON medical_supply.conflict_reports (moderation_status, submitted_at);
CREATE INDEX conflict_reports_pharmacy_idx ON medical_supply.conflict_reports (pharmacy_id, submitted_at DESC);
CREATE INDEX conflict_reports_inventory_idx ON medical_supply.conflict_reports (inventory_id);
CREATE INDEX conflict_reports_reporter_idx ON medical_supply.conflict_reports (reporter_user_id);
CREATE INDEX conflict_reports_reviewer_idx ON medical_supply.conflict_reports (reviewed_by);
CREATE INDEX conflict_reports_retention_idx ON medical_supply.conflict_reports (retention_until);

CREATE TABLE medical_supply.reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_user_id uuid NOT NULL REFERENCES medical_supply.app_users(id),
    pharmacy_id uuid NOT NULL REFERENCES medical_supply.pharmacies(id),
    status text NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'confirmed', 'declined', 'cancelled', 'expired', 'collected')),
    idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 16 AND 128),
    pickup_token_hash bytea UNIQUE CHECK (pickup_token_hash IS NULL OR octet_length(pickup_token_hash) = 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    confirmed_at timestamptz,
    closed_at timestamptz,
    UNIQUE (patient_user_id, idempotency_key),
    UNIQUE (id, pharmacy_id),
    CHECK (expires_at > created_at),
    CHECK (confirmed_at IS NULL OR (confirmed_at >= created_at AND confirmed_at < expires_at)),
    CHECK (closed_at IS NULL OR closed_at >= created_at),
    CHECK (status <> 'confirmed' OR (confirmed_at IS NOT NULL AND pickup_token_hash IS NOT NULL)),
    CHECK ((status IN ('declined', 'cancelled', 'expired', 'collected')) = (closed_at IS NOT NULL)),
    CHECK (status <> 'requested' OR (confirmed_at IS NULL AND pickup_token_hash IS NULL)),
    CHECK (status <> 'collected' OR (confirmed_at IS NOT NULL AND pickup_token_hash IS NOT NULL AND closed_at >= confirmed_at)),
    CHECK (status <> 'expired' OR closed_at >= expires_at)
);
CREATE INDEX reservations_patient_idx ON medical_supply.reservations (patient_user_id, created_at DESC);
CREATE INDEX reservations_pharmacy_idx ON medical_supply.reservations (pharmacy_id, status, created_at DESC);
CREATE INDEX reservations_due_idx ON medical_supply.reservations (expires_at)
    WHERE status IN ('requested', 'confirmed');

CREATE TABLE medical_supply.reservation_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id uuid NOT NULL,
    pharmacy_id uuid NOT NULL,
    inventory_id uuid NOT NULL,
    package_quantity bigint NOT NULL CHECK (package_quantity > 0),
    quoted_price_minor_units bigint NOT NULL CHECK (quoted_price_minor_units >= 0),
    currency_code text NOT NULL REFERENCES medical_supply.currencies(code),
    FOREIGN KEY (reservation_id, pharmacy_id) REFERENCES medical_supply.reservations(id, pharmacy_id),
    FOREIGN KEY (inventory_id, pharmacy_id) REFERENCES medical_supply.inventory(id, pharmacy_id),
    UNIQUE (reservation_id, inventory_id)
);
CREATE INDEX reservation_items_inventory_idx ON medical_supply.reservation_items (inventory_id);
CREATE INDEX reservation_items_pharmacy_idx ON medical_supply.reservation_items (pharmacy_id);

CREATE TABLE medical_supply.reservation_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id uuid NOT NULL REFERENCES medical_supply.reservations(id),
    actor_user_id uuid REFERENCES medical_supply.app_users(id),
    actor_type text NOT NULL CHECK (actor_type IN ('patient', 'pharmacy', 'system')),
    event_type text NOT NULL CHECK (event_type IN ('requested', 'confirmed', 'declined', 'cancelled', 'expired', 'collected')),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    request_id uuid NOT NULL,
    CHECK ((actor_type = 'system') = (actor_user_id IS NULL))
);
CREATE INDEX reservation_events_history_idx ON medical_supply.reservation_events (reservation_id, recorded_at);
CREATE INDEX reservation_events_actor_idx ON medical_supply.reservation_events (actor_user_id);

CREATE TABLE medical_supply.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES medical_supply.app_users(id),
    actor_type text NOT NULL CHECK (actor_type IN ('user', 'service')),
    action text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.]{2,79}$'),
    entity_type text NOT NULL CHECK (length(btrim(entity_type)) BETWEEN 1 AND 80),
    entity_id uuid,
    organization_id uuid REFERENCES medical_supply.organizations(id),
    request_id uuid NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 8192),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((actor_type = 'service') = (actor_user_id IS NULL))
);
CREATE INDEX audit_logs_entity_idx ON medical_supply.audit_logs (entity_type, entity_id, recorded_at DESC);
CREATE INDEX audit_logs_actor_idx ON medical_supply.audit_logs (actor_user_id, recorded_at DESC);
CREATE INDEX audit_logs_organization_idx ON medical_supply.audit_logs (organization_id, recorded_at DESC);
CREATE INDEX audit_logs_request_idx ON medical_supply.audit_logs (request_id);
CREATE INDEX audit_logs_time_idx ON medical_supply.audit_logs (recorded_at);

CREATE FUNCTION medical_supply.reject_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'History table %.% is append-only; % is forbidden', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
        USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION medical_supply.reject_history_mutation() FROM PUBLIC;

CREATE TRIGGER supply_events_immutable_rows BEFORE UPDATE OR DELETE ON medical_supply.supply_events
    FOR EACH ROW EXECUTE FUNCTION medical_supply.reject_history_mutation();
CREATE TRIGGER supply_events_immutable_truncate BEFORE TRUNCATE ON medical_supply.supply_events
    FOR EACH STATEMENT EXECUTE FUNCTION medical_supply.reject_history_mutation();
CREATE TRIGGER audit_logs_immutable_rows BEFORE UPDATE OR DELETE ON medical_supply.audit_logs
    FOR EACH ROW EXECUTE FUNCTION medical_supply.reject_history_mutation();
CREATE TRIGGER audit_logs_immutable_truncate BEFORE TRUNCATE ON medical_supply.audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION medical_supply.reject_history_mutation();
CREATE TRIGGER regulatory_checks_immutable_rows BEFORE UPDATE OR DELETE ON medical_supply.regulatory_verification_checks
    FOR EACH ROW EXECUTE FUNCTION medical_supply.reject_history_mutation();
CREATE TRIGGER regulatory_checks_immutable_truncate BEFORE TRUNCATE ON medical_supply.regulatory_verification_checks
    FOR EACH STATEMENT EXECUTE FUNCTION medical_supply.reject_history_mutation();
CREATE TRIGGER license_checks_immutable_rows BEFORE UPDATE OR DELETE ON medical_supply.license_verification_checks
    FOR EACH ROW EXECUTE FUNCTION medical_supply.reject_history_mutation();
CREATE TRIGGER license_checks_immutable_truncate BEFORE TRUNCATE ON medical_supply.license_verification_checks
    FOR EACH STATEMENT EXECUTE FUNCTION medical_supply.reject_history_mutation();
CREATE TRIGGER inventory_observations_immutable_rows BEFORE UPDATE OR DELETE ON medical_supply.inventory_observations
    FOR EACH ROW EXECUTE FUNCTION medical_supply.reject_history_mutation();
CREATE TRIGGER inventory_observations_immutable_truncate BEFORE TRUNCATE ON medical_supply.inventory_observations
    FOR EACH STATEMENT EXECUTE FUNCTION medical_supply.reject_history_mutation();

ALTER TABLE medical_supply.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.app_users FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.user_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.pharmacy_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.pharmacy_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.regulator_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.regulator_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.regulatory_verification_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.regulatory_verification_checks FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.license_verification_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.license_verification_checks FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.serialized_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.serialized_items FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.supply_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.supply_events FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.inventory FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.inventory_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.inventory_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.stock_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.stock_confirmations FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.conflict_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.conflict_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.reservation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.reservation_items FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.reservation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.reservation_events FORCE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_supply.audit_logs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA medical_supply FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA medical_supply FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA medical_supply REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA medical_supply REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA medical_supply REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
