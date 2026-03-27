# Security Policy

## Supported Versions

GreenKeeper Pro is currently in active development. We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

As the project matures, we will maintain security updates for the current major version and the previous major version for a transition period.

## Security Update Policy

- **Critical vulnerabilities**: Patched within 24-48 hours
- **High severity vulnerabilities**: Patched within 7 days
- **Medium/Low severity vulnerabilities**: Addressed in the next scheduled release
- **Dependency updates**: Reviewed monthly and applied as needed

Security updates are released as patch versions and deployed immediately to production. Users are notified through the application and via email for critical security updates.

## Reporting Vulnerabilities

We take the security of GreenKeeper Pro seriously. If you discover a security vulnerability, please follow responsible disclosure practices.

### How to Report

**Do not** open a public GitHub issue for security vulnerabilities.

Instead, please report security issues via email to:

**[security@veteransmemorialgc.com](mailto:security@veteransmemorialgc.com)**

### What to Include in Your Report

Please provide the following information to help us understand and address the vulnerability:

1. **Description**: A clear description of the vulnerability
2. **Impact**: The potential impact and severity of the issue
3. **Steps to Reproduce**: Detailed steps to reproduce the vulnerability
4. **Proof of Concept**: Code snippets, screenshots, or videos demonstrating the issue
5. **Affected Components**: Which parts of the application are affected
6. **Suggested Fix**: If you have ideas on how to remediate (optional)
7. **Your Contact Information**: So we can follow up with questions

### Expected Response Timeline

- **Initial Response**: Within 48 hours of receipt
- **Status Update**: Within 5 business days with our assessment and planned actions
- **Resolution**: Depends on severity
  - Critical: 24-48 hours
  - High: 7 days
  - Medium: 30 days
  - Low: Next release cycle

We will keep you informed throughout the investigation and resolution process. Once the vulnerability is patched, we will coordinate with you on public disclosure timing.

### Recognition

We appreciate the security research community's efforts. Researchers who responsibly disclose vulnerabilities will be:

- Acknowledged in our security advisory (unless they prefer to remain anonymous)
- Listed in our CONTRIBUTORS.md file
- Provided with updates on the fix timeline and resolution

## Security Architecture

GreenKeeper Pro implements defense-in-depth security practices across multiple layers:

### Authentication

- **Provider**: Supabase Auth with JWT-based session management
- **Session Security**:
  - HTTP-only cookies for session tokens (when possible)
  - Secure session storage with automatic expiration
  - Session refresh tokens with rotation
- **Password Requirements**: Enforced by Supabase (minimum 6 characters)
- **Multi-Factor Authentication**: Supported through Supabase Auth
- **Password Reset**: Secure email-based password recovery flow

### Authorization

- **Row Level Security (RLS)**: Enabled on all database tables
- **Policy-Based Access Control**:
  - Users can only access data associated with their organization
  - Role-based permissions (super, asst_super, foreman, mechanic, crew, seasonal, pro, member)
  - Granular policies for read, insert, update, and delete operations
- **API Route Protection**: Server-side authentication checks on all API endpoints
- **Service Role Usage**: Service role key used only for trusted server-side operations

### API Security

- **Server-Side Validation**: All input validated using Zod schemas
- **SQL Injection Prevention**: Parameterized queries via Supabase client
- **XSS Prevention**: React's built-in XSS protection, content sanitization
- **CSRF Protection**: Next.js CSRF tokens for state-changing operations
- **Rate Limiting**:
  - Supabase built-in rate limiting on auth endpoints
  - Consider implementing application-level rate limiting for API routes in production
- **Webhook Security**: HMAC signature verification for daily briefing webhooks using `DAILY_BRIEFING_SECRET`

### Data Protection

- **Encryption in Transit**: All connections use HTTPS/TLS
- **Encryption at Rest**: Supabase PostgreSQL encrypted storage
- **Database Connection**: Encrypted connections to Supabase
- **File Upload Security**:
  - Storage bucket policies restrict file access
  - File type validation on upload
  - Size limits enforced (10MB for images)
- **Sensitive Data Handling**:
  - Chemical application records (regulatory compliance data)
  - Staff personal information (scheduling, contact details)
  - Member data (names, contact information)
  - Equipment maintenance history

### Client Security

- **Content Security Policy (CSP)**: Configured in Next.js headers
- **Subresource Integrity**: Used for CDN resources
- **Progressive Web App (PWA)**: Service worker with secure offline storage
- **Secure Cookie Flags**: SameSite, Secure, HttpOnly where applicable

## Environment Variables

Proper management of environment variables is critical for security.

### Public Variables (Safe for Client)

These variables are prefixed with `NEXT_PUBLIC_` and are embedded in the client bundle. They should **never** contain secrets:

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL (publicly discoverable)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key (protected by RLS)
- `NEXT_PUBLIC_WEATHER_API_KEY`: WeatherAPI.com key (rate-limited, low risk)
- `NEXT_PUBLIC_APP_URL`: Application URL
- `NEXT_PUBLIC_SENTRY_DSN`: Sentry error tracking DSN (public by design)

**Note**: While these are "public," the anon key is still protected by Supabase RLS policies. Never use the service role key in client-side code.

### Private Variables (Server-Only)

These variables must **never** be exposed to the client:

- `SUPABASE_SERVICE_ROLE_KEY`: Full database access, bypasses RLS (use with extreme caution)
- `ANTHROPIC_API_KEY`: AI service access, incurs costs
- `DAILY_BRIEFING_SECRET`: Webhook authentication secret
- `SENTRY_AUTH_TOKEN`: Sentry deployment authentication

### Environment File Security

**Critical**: Never commit environment files to version control

- `.env.local` - Contains your actual secrets (git-ignored)
- `.env.local.example` - Template with placeholder values (safe to commit)
- `.env.test` - Test environment configuration (should not contain production secrets)

**Verification**:
```bash
# Ensure .env files are in .gitignore
grep -E "^\.env" .gitignore

# Check for accidentally committed secrets
git log --all --full-history -- .env.local
```

### Key Rotation

Rotate sensitive keys regularly:

- **Service role key**: Rotate every 90 days or if compromised
- **API keys**: Rotate if usage patterns suggest compromise
- **Webhook secrets**: Rotate every 180 days or if exposed

## Best Practices for Deployment

### Dependency Management

- **Regular Updates**: Run `npm audit` and `npm outdated` weekly
- **Automated Scanning**: Enable Dependabot or Snyk for automated vulnerability alerts
- **Update Strategy**:
  ```bash
  # Check for vulnerabilities
  npm audit

  # Update to fix vulnerabilities
  npm audit fix

  # For breaking changes, update manually
  npm update
  ```
- **Lock File**: Always commit `package-lock.json` to ensure reproducible builds

### Error Monitoring

- **Sentry Configuration**: Enable Sentry for production error tracking
- **Privacy**: Ensure PII is not logged in error messages
- **Alert Rules**: Set up alerts for critical errors and security-related events
- **Error Context**: Include relevant context but sanitize sensitive data

### Database Security

- **RLS Policy Review**:
  - Audit RLS policies quarterly
  - Test policies with different user roles
  - Ensure policies cover all tables
- **Backup Strategy**:
  - Supabase automatic backups (daily for paid plans)
  - Test backup restoration procedures quarterly
- **Access Audit**: Review database access logs monthly
- **Connection Limits**: Monitor and set appropriate connection pool limits

### Application Security

- **Strong Admin Passwords**:
  - Minimum 12 characters
  - Mix of uppercase, lowercase, numbers, and symbols
  - Use a password manager
- **Two-Factor Authentication (2FA)**:
  - Enable for all superintendent and admin accounts
  - Supported through Supabase Auth
- **Session Management**:
  - Sessions expire after 7 days of inactivity
  - Logout invalidates session tokens
- **Audit Logging**:
  - Activity log tracks user actions
  - Review logs for suspicious patterns

### Deployment Checklist

Before deploying to production:

- [ ] All environment variables properly configured
- [ ] HTTPS enforced for all endpoints
- [ ] Sentry error tracking enabled
- [ ] Database RLS policies active and tested
- [ ] Service role key stored securely (not in code)
- [ ] Rate limiting configured
- [ ] Content Security Policy headers set
- [ ] Backup procedures tested
- [ ] Admin accounts secured with strong passwords and 2FA
- [ ] Security headers configured (HSTS, X-Frame-Options, etc.)

### Vercel Deployment Security

- **Environment Variables**: Store in Vercel dashboard, not in code
- **Preview Deployments**: Use separate test credentials for preview deployments
- **Domain Configuration**: Enable HTTPS and HSTS
- **Function Logs**: Monitor for sensitive data leakage in logs
- **Access Control**: Limit who can access production deployments

## Known Security Considerations

### Sensitive Data Categories

GreenKeeper Pro handles several categories of sensitive information that require special attention:

#### 1. Chemical Application Data

**Regulatory Importance**: Chemical applications are subject to state and federal regulations.

- **Data Includes**: Product names, EPA registration numbers, application rates, dates, locations, operators
- **Retention Requirements**: Must be retained for 2-3 years (varies by jurisdiction)
- **Access Control**: Limited to superintendent, assistant superintendent, and mechanic roles
- **Audit Trail**: All modifications logged in activity log
- **Export**: PDF export feature for regulatory inspections

**Mitigation**:
- RLS policies restrict access by role
- Activity logging tracks all changes
- Data cannot be deleted, only marked inactive
- Regular backups ensure data preservation

#### 2. Staff Personal Information

**Privacy Concerns**: Scheduling and staff data contains PII.

- **Data Includes**: Names, emails, phone numbers, work schedules, roles, employment status
- **Access Control**: Staff can view their own information, supervisors can view team information
- **Usage**: Used for task assignment, scheduling, and communication

**Mitigation**:
- RLS policies enforce data isolation
- Email communications use BCC for group messages
- Staff cannot access other staff's personal details unless supervisor
- Minimal data collection principle applied

#### 3. Member Portal Data

**Privacy Requirements**: Member data must be handled according to privacy regulations.

- **Data Includes**: Member names, contact information, course feedback, preferences
- **Access Control**: Members can only view their own data
- **Purpose**: Course condition updates, event information, feedback submission

**Mitigation**:
- Separate member portal with restricted access
- RLS policies enforce strict data isolation
- No financial or credit card data stored (out of scope)
- Members can request data deletion

#### 4. Equipment and Maintenance Records

**Business Sensitive**: Equipment history and costs are business-sensitive.

- **Data Includes**: Equipment details, maintenance history, service costs, warranties
- **Access Control**: Mechanic and superintendent roles only
- **Purpose**: Maintenance tracking, warranty management, budget planning

**Mitigation**:
- Role-based access restrictions
- Historical records maintained for audit purposes
- No public exposure of cost data

### Additional Considerations

#### AI/LLM Data Handling

- **Anthropic Claude Integration**: Used for diagnostics and daily briefings
- **Data Sent**: Turf photos, weather data, task descriptions (no PII)
- **Privacy**: Anthropic's data usage policy applies
- **Mitigation**: Sanitize data before sending to AI services, avoid sending names or contact information

#### PWA Offline Storage

- **Local Storage**: Service worker caches data for offline use
- **Security**: Encrypted device storage, automatic cache expiration
- **Mitigation**: Sensitive data not cached offline, cache cleared on logout

#### Third-Party Integrations

- **WeatherAPI.com**: Location data sent (golf course address only, no user data)
- **Sentry**: Error reports may contain stack traces (PII stripped)
- **Vercel Analytics**: Anonymized usage analytics only

## Security Contacts

For security concerns, questions, or to report vulnerabilities:

- **Email**: security@veteransmemorialgc.com
- **Maintainers**: See CONTRIBUTORS.md

For non-security issues, please use the standard GitHub issue tracker.

---

**Last Updated**: 2026-03-27
**Version**: 0.1.0
