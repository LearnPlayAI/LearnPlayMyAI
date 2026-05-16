import { PreviewFrame, ClickableElement } from '../PreviewFrame';
import { useBrandEditor } from '../BrandEditorShell';

export function PreviewCommerce() {
  const { state } = useBrandEditor();
  const brandName = state.brandName || 'LearnPlay';

  const pricingTiers = [
    { 
      name: 'Basic', 
      price: 9.99, 
      period: 'month',
      features: ['5 Courses', '10 Quizzes/month', 'Email Support', 'Basic Analytics'],
      popular: false
    },
    { 
      name: 'Pro', 
      price: 24.99, 
      period: 'month',
      features: ['Unlimited Courses', '100 Quizzes/month', 'Priority Support', 'Advanced Analytics', 'Custom Branding'],
      popular: true
    },
    { 
      name: 'Enterprise', 
      price: 99.99, 
      period: 'month',
      features: ['Everything in Pro', 'Unlimited Quizzes', 'Dedicated Account Manager', 'API Access', 'SSO Integration', 'Custom Contracts'],
      popular: false
    },
  ];

  const creditPackages = [
    { credits: 100, price: 9.99, bonus: 0, pricePerCredit: '0.10', badge: null },
    { credits: 500, price: 39.99, bonus: 50, pricePerCredit: '0.07', badge: 'Popular' },
    { credits: 1000, price: 69.99, bonus: 150, pricePerCredit: '0.06', badge: 'Best Value' },
  ];

  const orderItems = [
    { name: 'Pro Subscription (Annual)', price: 249.99 },
    { name: '500 LP Credits Pack', price: 39.99 },
  ];

  const billingHistory = [
    { id: 'TXN-001', date: 'Dec 1, 2024', description: 'Pro Subscription', amount: 24.99, status: 'paid' },
    { id: 'TXN-002', date: 'Nov 28, 2024', description: 'Credit Pack (500 LPC)', amount: 39.99, status: 'paid' },
    { id: 'TXN-003', date: 'Nov 15, 2024', description: 'Course: Data Science', amount: 49.99, status: 'pending' },
    { id: 'TXN-004', date: 'Nov 10, 2024', description: 'Credit Pack (100 LPC)', amount: 9.99, status: 'failed' },
  ];

  const revenueStats = [
    { label: 'Total Revenue', value: 'R 12,450.00', change: '+15%' },
    { label: 'Total Sales', value: '156', change: '+8%' },
    { label: 'Active Students', value: '89', change: '+12%' },
    { label: 'Avg. Order Value', value: 'R 79.81', change: '+3%' },
  ];

  const topCourses = [
    { rank: 1, title: 'Introduction to Python', sales: 45, revenue: 'R 4,050.00' },
    { rank: 2, title: 'Advanced JavaScript', sales: 32, revenue: 'R 2,880.00' },
    { rank: 3, title: 'Data Science Fundamentals', sales: 28, revenue: 'R 2,520.00' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'var(--success)';
      case 'pending': return 'var(--warning)';
      case 'failed': return 'var(--destructive)';
      default: return 'var(--text-muted)';
    }
  };

  return (
    <PreviewFrame className="min-h-[2400px]" data-testid="preview-commerce">
      <div className="p-8 space-y-12" style={{ backgroundColor: 'var(--surface-primary)' }}>
        
        {/* Section Header */}
        <ClickableElement
          editKey="brand-identity"
          className="text-center space-y-2"
          data-section="commerce-header"
          data-testid="preview-commerce-header"
          aria-label="Edit commerce header"
        >
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }} data-testid="preview-commerce-title">
            {brandName} Pricing & Commerce
          </h1>
          <p className="text-lg" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }} data-testid="preview-commerce-subtitle">
            Preview your commerce components with your brand styling
          </p>
        </ClickableElement>

        {/* Pricing Cards Section */}
        <div data-section="pricing" data-testid="preview-commerce-pricing-section">
          <ClickableElement
            editKey="--foreground"
            as="h2"
            className="text-2xl font-bold text-center"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-xl)' }}
            data-testid="preview-commerce-pricing-header"
            aria-label="Edit pricing header"
          >
            Choose Your Plan
          </ClickableElement>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {pricingTiers.map((tier, i) => (
              <ClickableElement
                key={tier.name}
                editKey="--pricing-card-bg"
                className={`rounded-xl p-6 relative ${tier.popular ? 'ring-2' : ''}`}
                style={{ 
                  backgroundColor: tier.popular ? 'var(--pricing-card-featured-bg)' : 'var(--pricing-card-bg)', 
                  border: tier.popular ? '2px solid var(--pricing-card-featured-border)' : '1px solid var(--pricing-card-border)',
                  color: 'var(--pricing-card-fg)'
                }}
                data-section="pricing"
                data-testid={`preview-commerce-pricing-card-${i}`}
                aria-label={`Edit ${tier.name} pricing card`}
              >
                {tier.popular && (
                  <ClickableElement
                    editKey="--badge-bg"
                    className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-4 py-1 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--badge-fg)' }}
                    data-testid={`preview-commerce-popular-badge-${i}`}
                    aria-label="Edit popular badge"
                  >
                    Most Popular
                  </ClickableElement>
                )}
                
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold" style={{ color: 'var(--pricing-card-fg)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-sm)' }} data-testid={`preview-commerce-tier-name-${i}`}>
                    {tier.name}
                  </h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <ClickableElement
                      editKey="--primary"
                      as="span"
                      className="text-4xl font-bold"
                      style={{ color: 'var(--action-primary)' }}
                      data-testid={`preview-commerce-tier-price-${i}`}
                      aria-label="Edit price color"
                    >
                      ${tier.price}
                    </ClickableElement>
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>/{tier.period}</span>
                  </div>
                </div>
                
                <ul className="space-y-3 mb-6">
                  {tier.features.map((feature, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm" style={{ color: 'var(--pricing-card-fg)' }} data-testid={`preview-commerce-feature-${i}-${j}`}>
                      <span style={{ color: 'var(--success)' }}>✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                
                <ClickableElement
                  editKey="--btn-primary-bg"
                  className={`w-full py-3 rounded-lg font-semibold text-center ${tier.popular ? '' : 'border'}`}
                  style={{ 
                    backgroundColor: tier.popular ? 'var(--btn-primary-bg)' : 'transparent',
                    color: tier.popular ? 'var(--btn-primary-fg)' : 'var(--btn-outline-fg)',
                    borderColor: 'var(--btn-outline-border)'
                  }}
                  data-testid={`preview-commerce-tier-cta-${i}`}
                  aria-label={`Subscribe to ${tier.name}`}
                >
                  {tier.popular ? 'Get Started' : 'Choose Plan'}
                </ClickableElement>
              </ClickableElement>
            ))}
          </div>
        </div>

        {/* LP Credits Purchase Section */}
        <div data-section="credits" data-testid="preview-commerce-credits-section">
          <ClickableElement
            editKey="--foreground"
            as="h2"
            className="text-2xl font-bold text-center mb-8"
            style={{ color: 'var(--text-primary)' }}
            data-testid="preview-commerce-credits-header"
            aria-label="Edit credits header"
          >
            LP Credits
          </ClickableElement>

          <div className="max-w-4xl mx-auto">
            {/* Current Balance Widget */}
            <ClickableElement
              editKey="--gradient-primary-from"
              className="rounded-xl p-6 mb-8"
              style={{
                background: 'linear-gradient(135deg, var(--gradient-primary-from), var(--gradient-primary-to))',
              }}
              data-section="credits"
              data-testid="preview-commerce-credit-balance"
              aria-label="Edit credit balance widget"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-80" style={{ color: 'var(--on-primary)' }}>Your Credit Balance</p>
                  <p className="text-4xl font-bold" style={{ color: 'var(--on-primary)' }} data-testid="preview-commerce-balance-amount">
                    1,250 <span className="text-lg font-normal">LPC</span>
                  </p>
                </div>
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
                  style={{ backgroundColor: 'var(--on-primary)', color: 'var(--action-primary)' }}
                  data-testid="preview-commerce-credit-icon"
                >
                  LP
                </div>
              </div>
            </ClickableElement>

            {/* Credit Packages */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {creditPackages.map((pkg, i) => (
                <ClickableElement
                  key={i}
                  editKey="--card-bg"
                  className="rounded-xl p-5 relative"
                  style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                  data-section="credits"
                  data-testid={`preview-commerce-credit-package-${i}`}
                  aria-label={`Buy ${pkg.credits} credits`}
                >
                  {pkg.badge && (
                    <ClickableElement
                      editKey="--badge-bg"
                      className="absolute -top-2 right-4 px-3 py-0.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: 'var(--badge-bg)', color: 'var(--badge-fg)' }}
                      data-testid={`preview-commerce-pkg-badge-${i}`}
                      aria-label="Edit package badge"
                    >
                      {pkg.badge}
                    </ClickableElement>
                  )}
                  
                  <div className="text-center py-4 mb-4 rounded-lg" style={{ backgroundColor: 'var(--surface-muted)' }}>
                    <p className="text-4xl font-bold" style={{ color: 'var(--fg-strong)' }} data-testid={`preview-commerce-pkg-credits-${i}`}>
                      {pkg.credits.toLocaleString()}
                    </p>
                    <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>LP Credits</p>
                  </div>
                  
                  {pkg.bonus > 0 && (
                    <ClickableElement
                      editKey="--accent"
                      className="flex items-center justify-center gap-1 mb-3 px-2 py-1 rounded text-xs font-semibold"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--action-accent) 20%, transparent)', color: 'var(--action-accent)' }}
                      data-testid={`preview-commerce-pkg-bonus-${i}`}
                      aria-label="Edit bonus badge"
                    >
                      +{pkg.bonus} Bonus Credits!
                    </ClickableElement>
                  )}
                  
                  <div className="text-center mb-4">
                    <p className="text-3xl font-bold" style={{ color: 'var(--fg-strong)' }} data-testid={`preview-commerce-pkg-price-${i}`}>
                      ${pkg.price}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--fg-muted)' }}>
                      ${pkg.pricePerCredit}/credit
                    </p>
                  </div>
                  
                  <ClickableElement
                    editKey="--btn-primary-bg"
                    className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2"
                    style={{ 
                      background: 'linear-gradient(135deg, var(--gradient-primary-from), var(--gradient-primary-to))',
                      color: 'var(--on-primary)' 
                    }}
                    data-testid={`preview-commerce-pkg-buy-${i}`}
                    aria-label={`Purchase ${pkg.credits} credits`}
                  >
                    <span>💳</span> Purchase
                  </ClickableElement>
                </ClickableElement>
              ))}
            </div>
          </div>
        </div>

        {/* Checkout Section */}
        <div data-section="checkout" data-testid="preview-commerce-checkout-section">
          <ClickableElement
            editKey="--foreground"
            as="h2"
            className="text-2xl font-bold text-center mb-8"
            style={{ color: 'var(--text-primary)' }}
            data-testid="preview-commerce-checkout-header"
            aria-label="Edit checkout header"
          >
            Checkout
          </ClickableElement>

          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Payment Form */}
            <ClickableElement
              editKey="--card-bg"
              className="rounded-xl p-6 space-y-5"
              style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
              data-section="checkout"
              data-testid="preview-commerce-payment-form"
              aria-label="Edit payment form"
            >
              <h3 className="font-semibold text-lg" style={{ color: 'var(--card-fg)', fontFamily: 'var(--font-heading)' }} data-testid="preview-commerce-payment-title">
                Payment Details
              </h3>
              
              {/* Payment Methods */}
              <div className="space-y-3">
                <p className="text-sm font-medium" style={{ color: 'var(--label-fg)' }}>Payment Method</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: 'Card', icon: '💳', selected: true },
                    { name: 'PayPal', icon: '🅿️', selected: false },
                    { name: 'Bank', icon: '🏦', selected: false }
                  ].map((method, i) => (
                    <ClickableElement
                      key={method.name}
                      editKey={method.selected ? '--card-selected-bg' : '--card-bg'}
                      className="flex flex-col items-center gap-1 py-3 px-2 rounded-lg text-sm font-medium cursor-pointer"
                      style={{ 
                        backgroundColor: method.selected ? 'var(--card-selected-bg)' : 'var(--card-bg)',
                        border: method.selected ? '2px solid var(--card-selected-border)' : '1px solid var(--card-border)',
                        color: method.selected ? 'var(--action-primary)' : 'var(--card-fg)'
                      }}
                      data-testid={`preview-commerce-payment-method-${i}`}
                      aria-label={`Select ${method.name} payment`}
                    >
                      <span className="text-lg">{method.icon}</span>
                      <span>{method.name}</span>
                    </ClickableElement>
                  ))}
                </div>
              </div>

              {/* Form Fields with Input Tokens */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: 'var(--label-fg)' }}>Card Number</label>
                  <ClickableElement
                    editKey="--input-bg"
                    className="w-full p-3 rounded-lg text-sm flex items-center gap-2"
                    style={{ 
                      backgroundColor: 'var(--input-bg)', 
                      color: 'var(--input-fg)', 
                      border: '1px solid var(--input-border)' 
                    }}
                    data-testid="preview-commerce-card-number"
                    aria-label="Edit input field"
                  >
                    <span>💳</span>
                    <span>4242 •••• •••• 4242</span>
                  </ClickableElement>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" style={{ color: 'var(--label-fg)' }}>Expiry</label>
                    <ClickableElement
                      editKey="--input-bg"
                      className="w-full p-3 rounded-lg text-sm"
                      style={{ 
                        backgroundColor: 'var(--input-bg)', 
                        color: 'var(--input-fg)', 
                        border: '1px solid var(--input-border)' 
                      }}
                      data-testid="preview-commerce-expiry"
                      aria-label="Edit expiry input"
                    >
                      12/26
                    </ClickableElement>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" style={{ color: 'var(--label-fg)' }}>CVV</label>
                    <ClickableElement
                      editKey="--input-bg"
                      className="w-full p-3 rounded-lg text-sm"
                      style={{ 
                        backgroundColor: 'var(--input-bg)', 
                        color: 'var(--input-fg)', 
                        border: '1px solid var(--input-border)' 
                      }}
                      data-testid="preview-commerce-cvv"
                      aria-label="Edit CVV input"
                    >
                      •••
                    </ClickableElement>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: 'var(--label-fg)' }}>Cardholder Name</label>
                  <ClickableElement
                    editKey="--input-bg"
                    className="w-full p-3 rounded-lg text-sm"
                    style={{ 
                      backgroundColor: 'var(--input-bg)', 
                      color: 'var(--input-fg)', 
                      border: '1px solid var(--input-border)' 
                    }}
                    data-testid="preview-commerce-cardholder"
                    aria-label="Edit cardholder input"
                  >
                    John Doe
                  </ClickableElement>
                </div>

                {/* Coupon Section */}
                <div className="pt-4 mt-4" style={{ borderTop: '1px solid var(--stroke-default)' }}>
                  <label className="text-sm font-medium" style={{ color: 'var(--label-fg)' }}>Discount Code</label>
                  <div className="flex gap-2 mt-2">
                    <ClickableElement
                      editKey="--input-bg"
                      className="flex-1 p-3 rounded-lg text-sm"
                      style={{ 
                        backgroundColor: 'var(--input-bg)', 
                        color: 'var(--input-placeholder)', 
                        border: '1px solid var(--input-border)' 
                      }}
                      data-testid="preview-commerce-coupon-input"
                      aria-label="Edit coupon input"
                    >
                      Enter coupon code
                    </ClickableElement>
                    <ClickableElement
                      editKey="--btn-secondary-bg"
                      className="px-4 py-2 rounded-lg font-medium"
                      style={{ backgroundColor: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-fg)' }}
                      data-testid="preview-commerce-apply-coupon"
                      aria-label="Apply coupon button"
                    >
                      Apply
                    </ClickableElement>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-sm" style={{ color: 'var(--success)' }}>
                    <span>✓</span>
                    <span>Coupon SAVE20 applied - 20% off!</span>
                  </div>
                </div>
              </div>
            </ClickableElement>

            {/* Order Summary */}
            <div className="space-y-4">
              <ClickableElement
                editKey="--card-bg"
                className="rounded-xl p-6 space-y-4"
                style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                data-section="checkout"
                data-testid="preview-commerce-order-summary"
                aria-label="Edit order summary"
              >
                <h3 className="font-semibold text-lg" style={{ color: 'var(--card-fg)', fontFamily: 'var(--font-heading)' }} data-testid="preview-commerce-order-title">
                  Order Summary
                </h3>
                
                <div className="space-y-3">
                  {orderItems.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm" data-testid={`preview-commerce-order-item-${i}`}>
                      <span style={{ color: 'var(--card-fg)' }}>{item.name}</span>
                      <span style={{ color: 'var(--card-fg)' }}>${item.price.toFixed(2)}</span>
                    </div>
                  ))}
                  
                  <div style={{ borderTop: '1px solid var(--stroke-default)', paddingTop: '0.75rem' }}>
                    <div className="flex justify-between text-sm" data-testid="preview-commerce-order-subtotal">
                      <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
                      <span style={{ color: 'var(--card-fg)' }}>$289.98</span>
                    </div>
                    <div className="flex justify-between text-sm mt-2" data-testid="preview-commerce-order-discount">
                      <span style={{ color: 'var(--success)' }}>Discount (SAVE20)</span>
                      <span style={{ color: 'var(--success)' }}>-$58.00</span>
                    </div>
                    <div className="flex justify-between text-sm mt-2" data-testid="preview-commerce-order-tax">
                      <span style={{ color: 'var(--text-muted)' }}>Tax (15% VAT)</span>
                      <span style={{ color: 'var(--card-fg)' }}>$34.80</span>
                    </div>
                  </div>
                  
                  <div 
                    className="flex justify-between pt-3 font-bold text-lg"
                    style={{ borderTop: '2px solid var(--stroke-default)' }}
                    data-testid="preview-commerce-order-total"
                  >
                    <span style={{ color: 'var(--card-fg)' }}>Total</span>
                    <ClickableElement
                      editKey="--primary"
                      as="span"
                      style={{ color: 'var(--action-primary)' }}
                      data-testid="preview-commerce-order-total-amount"
                      aria-label="Edit total color"
                    >
                      $266.78
                    </ClickableElement>
                  </div>
                </div>

                <ClickableElement
                  editKey="--btn-primary-bg"
                  className="w-full py-4 rounded-lg font-semibold text-center flex items-center justify-center gap-2"
                  style={{ 
                    backgroundColor: 'var(--btn-primary-bg)', 
                    color: 'var(--btn-primary-fg)',
                    boxShadow: '0 4px 12px var(--game-glow)'
                  }}
                  data-testid="preview-commerce-complete-purchase"
                  aria-label="Complete purchase"
                >
                  <span>🔒</span> Pay $266.78
                </ClickableElement>
                
                <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                  Secure payment powered by YOCO. All payments in ZAR.
                </p>
              </ClickableElement>
            </div>
          </div>
        </div>

        {/* Purchase Confirmation/Success State */}
        <div data-section="success" data-testid="preview-commerce-success-section">
          <ClickableElement
            editKey="--foreground"
            as="h2"
            className="text-2xl font-bold text-center mb-8"
            style={{ color: 'var(--text-primary)' }}
            data-testid="preview-commerce-success-header"
            aria-label="Edit success header"
          >
            Purchase Confirmation
          </ClickableElement>

          <ClickableElement
            editKey="--card-bg"
            className="max-w-lg mx-auto rounded-xl overflow-hidden"
            style={{ 
              backgroundColor: 'var(--card-bg)', 
              border: '1px solid var(--card-border)',
              boxShadow: '0 8px 32px var(--card-shadow)'
            }}
            data-section="success"
            data-testid="preview-commerce-success-card"
            aria-label="Edit success card"
          >
            {/* Success Header */}
            <div className="text-center p-8">
              <ClickableElement
                editKey="--success"
                className="w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-4"
                style={{ backgroundColor: 'var(--alert-success-bg)' }}
                data-testid="preview-commerce-success-icon"
                aria-label="Edit success icon"
              >
                <span className="text-4xl" style={{ color: 'var(--success)' }}>✓</span>
              </ClickableElement>
              <h3 className="text-2xl font-bold mb-2" style={{ color: 'var(--card-fg)' }} data-testid="preview-commerce-success-title">
                Payment Successful!
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }} data-testid="preview-commerce-success-desc">
                Your purchase has been completed successfully.
              </p>
            </div>
            
            {/* Order Details */}
            <div className="p-6 space-y-4" style={{ backgroundColor: 'var(--surface-muted)', borderTop: '1px solid var(--stroke-default)' }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">📚</span>
                <span className="text-lg font-semibold" style={{ color: 'var(--card-fg)' }}>Course Purchase</span>
              </div>
              
              <div className="space-y-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--card-bg)' }}>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Course</span>
                  <span className="font-medium" style={{ color: 'var(--card-fg)' }}>Introduction to Python</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Status</span>
                  <span className="font-medium" style={{ color: 'var(--success)' }}>Enrolled</span>
                </div>
                <div className="flex justify-between text-sm pt-2" style={{ borderTop: '1px solid var(--stroke-default)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Amount Paid</span>
                  <span className="font-medium" style={{ color: 'var(--card-fg)' }}>R 890.00 ZAR</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-muted)' }}>Order ID</span>
                  <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>#ORD-2024-0542</span>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <ClickableElement
                  editKey="--btn-primary-bg"
                  className="flex-1 py-3 rounded-lg font-medium text-center flex items-center justify-center gap-2"
                  style={{ 
                    background: 'linear-gradient(135deg, var(--gradient-primary-from), var(--gradient-primary-to))',
                    color: 'var(--on-primary)'
                  }}
                  data-testid="preview-commerce-view-course"
                  aria-label="View course button"
                >
                  <span>📖</span> View Course
                </ClickableElement>
                <ClickableElement
                  editKey="--btn-ghost-bg"
                  className="flex-1 py-3 rounded-lg font-medium text-center border flex items-center justify-center gap-2"
                  style={{ 
                    backgroundColor: 'var(--btn-ghost-bg)', 
                    color: 'var(--btn-ghost-fg)',
                    borderColor: 'var(--btn-ghost-border)'
                  }}
                  data-testid="preview-commerce-download-receipt"
                  aria-label="Download receipt button"
                >
                  <span>📄</span> Receipt
                </ClickableElement>
              </div>
            </div>
          </ClickableElement>
        </div>

        {/* Invoice Preview Section */}
        <div data-section="invoice" data-testid="preview-commerce-invoice-section">
          <ClickableElement
            editKey="--foreground"
            as="h2"
            className="text-2xl font-bold text-center mb-8"
            style={{ color: 'var(--text-primary)' }}
            data-testid="preview-commerce-invoice-header"
            aria-label="Edit invoice header"
          >
            Invoice Preview
          </ClickableElement>

          <ClickableElement
            editKey="--card-bg"
            className="max-w-2xl mx-auto rounded-xl overflow-hidden"
            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
            data-section="invoice"
            data-testid="preview-commerce-invoice-card"
            aria-label="Edit invoice card"
          >
            <ClickableElement
              editKey="--gradient-primary-from"
              className="p-4"
              style={{
                background: 'linear-gradient(135deg, var(--gradient-primary-from), var(--gradient-primary-to))',
              }}
              data-testid="preview-commerce-invoice-header-gradient"
              aria-label="Edit invoice header gradient"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {state.logoUrl ? (
                    <img src={state.logoUrl} alt="Logo" className="h-8 object-contain" data-testid="preview-commerce-invoice-logo" />
                  ) : (
                    <div 
                      className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-sm"
                      style={{ backgroundColor: 'var(--on-primary)', color: 'var(--action-primary)' }}
                      data-testid="preview-commerce-invoice-logo-placeholder"
                    >
                      {brandName[0]}
                    </div>
                  )}
                  <span className="font-semibold" style={{ color: 'var(--on-primary)' }} data-testid="preview-commerce-invoice-brand">
                    {brandName}
                  </span>
                </div>
                <div className="text-right text-sm" style={{ color: 'var(--on-primary)' }}>
                  <p className="font-semibold" data-testid="preview-commerce-invoice-number">#INV-2024-0542</p>
                  <p className="opacity-80" data-testid="preview-commerce-invoice-date">Dec 5, 2024</p>
                </div>
              </div>
            </ClickableElement>
            
            <div className="p-4 space-y-3">
              <div className="flex justify-between text-sm" data-testid="preview-commerce-invoice-line-1">
                <span style={{ color: 'var(--card-fg)' }}>Pro Subscription - Monthly</span>
                <span style={{ color: 'var(--card-fg)' }}>$24.99</span>
              </div>
              <div 
                className="flex justify-between pt-2 font-semibold"
                style={{ borderTop: '1px solid var(--stroke-default)' }}
                data-testid="preview-commerce-invoice-total"
              >
                <span style={{ color: 'var(--card-fg)' }}>Total Paid</span>
                <span style={{ color: 'var(--action-primary)' }}>$24.99</span>
              </div>
              <div className="flex gap-2 pt-2">
                <ClickableElement
                  editKey="--btn-secondary-bg"
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-center"
                  style={{ backgroundColor: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-fg)' }}
                  data-testid="preview-commerce-download-invoice"
                  aria-label="Download invoice"
                >
                  Download PDF
                </ClickableElement>
                <ClickableElement
                  editKey="--btn-ghost-bg"
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-center border"
                  style={{ backgroundColor: 'var(--btn-ghost-bg)', color: 'var(--btn-ghost-fg)', borderColor: 'var(--btn-ghost-border)' }}
                  data-testid="preview-commerce-view-invoice"
                  aria-label="View invoice details"
                >
                  View Details
                </ClickableElement>
              </div>
            </div>
          </ClickableElement>
        </div>

        {/* Billing History Section */}
        <div data-section="billing-history" data-testid="preview-commerce-billing-section">
          <ClickableElement
            editKey="--foreground"
            as="h2"
            className="text-2xl font-bold text-center mb-8"
            style={{ color: 'var(--text-primary)' }}
            data-testid="preview-commerce-billing-header"
            aria-label="Edit billing history header"
          >
            Billing History
          </ClickableElement>

          <ClickableElement
            editKey="--card-bg"
            className="max-w-3xl mx-auto rounded-xl overflow-hidden"
            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
            data-section="billing-history"
            data-testid="preview-commerce-billing-table"
            aria-label="Edit billing table"
          >
            <div 
              className="grid grid-cols-12 gap-4 p-4 text-sm font-medium"
              style={{ backgroundColor: 'var(--table-header-bg)', color: 'var(--table-header-fg)' }}
              data-testid="preview-commerce-billing-table-header"
            >
              <div className="col-span-2">ID</div>
              <div className="col-span-3">Date</div>
              <div className="col-span-4">Description</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-1 text-center">Status</div>
            </div>
            {billingHistory.map((txn, i) => (
              <ClickableElement
                key={txn.id}
                editKey="--table-row-bg"
                className="grid grid-cols-12 gap-4 p-4 text-sm items-center"
                style={{ 
                  backgroundColor: 'var(--table-row-bg)',
                  borderTop: '1px solid var(--table-cell-border)' 
                }}
                data-testid={`preview-commerce-billing-row-${i}`}
                aria-label={`Edit billing row ${i + 1}`}
              >
                <div className="col-span-2" style={{ color: 'var(--text-muted)' }} data-testid={`preview-commerce-txn-id-${i}`}>
                  {txn.id}
                </div>
                <div className="col-span-3" style={{ color: 'var(--text-muted)' }} data-testid={`preview-commerce-txn-date-${i}`}>
                  {txn.date}
                </div>
                <div className="col-span-4" style={{ color: 'var(--table-row-fg)' }} data-testid={`preview-commerce-txn-desc-${i}`}>
                  {txn.description}
                </div>
                <div className="col-span-2 text-right font-medium" style={{ color: 'var(--table-row-fg)' }} data-testid={`preview-commerce-txn-amount-${i}`}>
                  ${txn.amount.toFixed(2)}
                </div>
                <div className="col-span-1 text-center">
                  <span 
                    className="px-2 py-1 rounded-full text-xs font-medium capitalize"
                    style={{ 
                      backgroundColor: `color-mix(in srgb, ${getStatusColor(txn.status)} 20%, transparent)`,
                      color: getStatusColor(txn.status)
                    }}
                    data-testid={`preview-commerce-txn-status-${i}`}
                  >
                    {txn.status}
                  </span>
                </div>
              </ClickableElement>
            ))}
          </ClickableElement>
        </div>

        {/* Subscription Status Section */}
        <div data-section="subscription" data-testid="preview-commerce-subscription-section">
          <ClickableElement
            editKey="--foreground"
            as="h2"
            className="text-2xl font-bold text-center mb-8"
            style={{ color: 'var(--text-primary)' }}
            data-testid="preview-commerce-subscription-header"
            aria-label="Edit subscription header"
          >
            Your Subscription
          </ClickableElement>

          <ClickableElement
            editKey="--card-bg"
            className="max-w-2xl mx-auto rounded-xl overflow-hidden"
            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
            data-section="subscription"
            data-testid="preview-commerce-subscription-card"
            aria-label="Edit subscription card"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-bold" style={{ color: 'var(--card-fg)' }} data-testid="preview-commerce-sub-plan">
                      Pro Plan
                    </h3>
                    <ClickableElement
                      editKey="--success"
                      className="px-2 py-1 rounded text-xs font-semibold"
                      style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}
                      data-testid="preview-commerce-sub-active-badge"
                      aria-label="Active subscription badge"
                    >
                      Active
                    </ClickableElement>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }} data-testid="preview-commerce-sub-billing">
                    Billed monthly • $24.99/month
                  </p>
                </div>
                <div 
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--action-primary)', color: 'var(--on-primary)' }}
                  data-testid="preview-commerce-sub-icon"
                >
                  <span className="text-2xl">⭐</span>
                </div>
              </div>

              <div 
                className="grid grid-cols-2 gap-4 p-4 rounded-lg mb-6"
                style={{ backgroundColor: 'var(--surface-muted)' }}
                data-testid="preview-commerce-sub-details"
              >
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Next billing date</p>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }} data-testid="preview-commerce-sub-next-billing">
                    January 5, 2025
                  </p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Member since</p>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }} data-testid="preview-commerce-sub-member-since">
                    March 15, 2024
                  </p>
                </div>
              </div>

              <ClickableElement
                editKey="--gradient-primary-from"
                className="p-4 rounded-lg mb-4"
                style={{
                  background: 'linear-gradient(135deg, var(--gradient-primary-from), var(--gradient-primary-to))',
                }}
                data-testid="preview-commerce-upgrade-prompt"
                aria-label="Edit upgrade prompt"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--on-primary)' }} data-testid="preview-commerce-upgrade-title">
                      Upgrade to Enterprise
                    </p>
                    <p className="text-sm opacity-80" style={{ color: 'var(--on-primary)' }} data-testid="preview-commerce-upgrade-desc">
                      Get unlimited access + dedicated support
                    </p>
                  </div>
                  <ClickableElement
                    editKey="--btn-primary-bg"
                    className="px-4 py-2 rounded-lg font-medium text-sm"
                    style={{ backgroundColor: 'var(--on-primary)', color: 'var(--action-primary)' }}
                    data-testid="preview-commerce-upgrade-btn"
                    aria-label="Upgrade subscription"
                  >
                    Upgrade Now
                  </ClickableElement>
                </div>
              </ClickableElement>

              <div className="flex gap-3">
                <ClickableElement
                  editKey="--btn-secondary-bg"
                  className="flex-1 py-2 rounded-lg font-medium text-sm text-center"
                  style={{ backgroundColor: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-fg)' }}
                  data-testid="preview-commerce-manage-sub"
                  aria-label="Manage subscription"
                >
                  Manage Subscription
                </ClickableElement>
                <ClickableElement
                  editKey="--btn-danger-bg"
                  className="px-4 py-2 rounded-lg font-medium text-sm border"
                  style={{ backgroundColor: 'transparent', color: 'var(--destructive)', borderColor: 'var(--destructive)' }}
                  data-testid="preview-commerce-cancel-sub"
                  aria-label="Cancel subscription"
                >
                  Cancel
                </ClickableElement>
              </div>
            </div>
          </ClickableElement>
        </div>

        {/* Marketplace Seller View - Revenue Dashboard */}
        <div data-section="marketplace" data-testid="preview-commerce-marketplace-section">
          <ClickableElement
            editKey="--foreground"
            as="h2"
            className="text-2xl font-bold text-center mb-8"
            style={{ color: 'var(--text-primary)' }}
            data-testid="preview-commerce-marketplace-header"
            aria-label="Edit marketplace header"
          >
            Seller Dashboard
          </ClickableElement>

          <div className="max-w-4xl mx-auto space-y-6">
            {/* Revenue Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {revenueStats.map((stat, i) => (
                <ClickableElement
                  key={i}
                  editKey="--stat-card-bg"
                  className="rounded-xl p-4"
                  style={{ backgroundColor: 'var(--stat-card-bg)', border: '1px solid var(--stat-card-border)' }}
                  data-testid={`preview-commerce-revenue-stat-${i}`}
                  aria-label={`Edit ${stat.label} stat card`}
                >
                  <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
                  <p className="text-xl font-bold" style={{ color: 'var(--stat-card-fg)' }}>{stat.value}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--success)' }}>{stat.change}</p>
                </ClickableElement>
              ))}
            </div>

            {/* Special Stats - Net Revenue & Refunds */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ClickableElement
                editKey="--primary"
                className="rounded-xl p-4"
                style={{ 
                  background: 'linear-gradient(135deg, color-mix(in srgb, var(--action-primary) 20%, transparent), color-mix(in srgb, var(--action-primary) 10%, transparent))',
                  border: '1px solid color-mix(in srgb, var(--action-primary) 30%, transparent)'
                }}
                data-testid="preview-commerce-net-revenue-card"
                aria-label="Edit net revenue card"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Net Revenue</span>
                  <span className="text-lg">📈</span>
                </div>
                <p className="text-2xl font-bold" style={{ color: 'var(--action-primary)' }}>R 11,250.00</p>
                <p className="text-xs mt-1" style={{ color: 'var(--action-primary)' }}>After refunds</p>
              </ClickableElement>

              <ClickableElement
                editKey="--destructive"
                className="rounded-xl p-4"
                style={{ 
                  background: 'linear-gradient(135deg, color-mix(in srgb, var(--destructive) 20%, transparent), color-mix(in srgb, var(--destructive) 10%, transparent))',
                  border: '1px solid color-mix(in srgb, var(--destructive) 30%, transparent)'
                }}
                data-testid="preview-commerce-refunds-card"
                aria-label="Edit refunds card"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Refunds</span>
                  <span className="text-lg">🔄</span>
                </div>
                <p className="text-2xl font-bold" style={{ color: 'var(--destructive)' }}>R 1,200.00</p>
                <p className="text-xs mt-1" style={{ color: 'var(--destructive)' }}>3 refunds this period</p>
              </ClickableElement>
            </div>

            {/* Earnings Chart Placeholder */}
            <ClickableElement
              editKey="--card-bg"
              className="rounded-xl p-6"
              style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
              data-testid="preview-commerce-earnings-chart"
              aria-label="Edit earnings chart"
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">📊</span>
                <h3 className="font-semibold" style={{ color: 'var(--card-fg)' }}>Earnings Overview</h3>
              </div>
              <div 
                className="h-40 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'var(--surface-muted)', border: '1px dashed var(--stroke-default)' }}
              >
                <div className="text-center">
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Revenue Chart</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Visualization placeholder</p>
                </div>
              </div>
            </ClickableElement>

            {/* Top Performing Courses */}
            <ClickableElement
              editKey="--card-bg"
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
              data-testid="preview-commerce-top-courses"
              aria-label="Edit top courses section"
            >
              <div className="p-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--stroke-default)' }}>
                <span className="text-lg">🏆</span>
                <h3 className="font-semibold" style={{ color: 'var(--card-fg)' }}>Top Performing Courses</h3>
              </div>
              <div>
                {topCourses.map((course, i) => (
                  <div 
                    key={i}
                    className="flex items-center gap-4 p-4"
                    style={{ borderTop: i > 0 ? '1px solid var(--stroke-default)' : 'none' }}
                    data-testid={`preview-commerce-top-course-${i}`}
                  >
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--action-primary) 20%, transparent)', color: 'var(--action-primary)' }}
                    >
                      {course.rank}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium" style={{ color: 'var(--card-fg)' }}>{course.title}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{course.sales} sales</p>
                    </div>
                    <p className="font-bold" style={{ color: 'var(--card-fg)' }}>{course.revenue}</p>
                  </div>
                ))}
              </div>
            </ClickableElement>

            {/* Payout Information */}
            <ClickableElement
              editKey="--accent"
              className="rounded-xl p-4"
              style={{ 
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--action-accent) 20%, transparent), color-mix(in srgb, var(--action-accent) 10%, transparent))',
                border: '1px solid color-mix(in srgb, var(--action-accent) 30%, transparent)'
              }}
              data-testid="preview-commerce-payout-info"
              aria-label="Edit payout information"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">💰</span>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Next Payout</p>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: 'var(--action-accent)' }}>R 8,500.00</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Processing on Dec 15, 2024</p>
                </div>
                <ClickableElement
                  editKey="--btn-primary-bg"
                  className="px-4 py-2 rounded-lg font-medium text-sm"
                  style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)' }}
                  data-testid="preview-commerce-view-payouts"
                  aria-label="View payouts"
                >
                  View Payouts
                </ClickableElement>
              </div>
            </ClickableElement>
          </div>
        </div>

        {/* Payment Buttons Section */}
        <div data-section="payment-buttons" data-testid="preview-commerce-buttons-section">
          <ClickableElement
            editKey="--foreground"
            as="h2"
            className="text-2xl font-bold text-center mb-8"
            style={{ color: 'var(--text-primary)' }}
            data-testid="preview-commerce-buttons-header"
            aria-label="Edit payment buttons header"
          >
            Payment Action Buttons
          </ClickableElement>

          <div className="max-w-2xl mx-auto space-y-4">
            {/* Primary CTA */}
            <ClickableElement
              editKey="--btn-primary-bg"
              className="w-full py-4 rounded-xl font-bold text-lg text-center"
              style={{ 
                backgroundColor: 'var(--btn-primary-bg)', 
                color: 'var(--btn-primary-fg)',
                boxShadow: '0 4px 14px var(--game-glow)'
              }}
              data-section="payment-buttons"
              data-testid="preview-commerce-btn-primary"
              aria-label="Primary purchase button"
            >
              Buy Now - $49.99
            </ClickableElement>

            {/* Gradient CTA */}
            <ClickableElement
              editKey="--gradient-primary-from"
              className="w-full py-4 rounded-xl font-bold text-lg text-center"
              style={{ 
                background: 'linear-gradient(135deg, var(--gradient-primary-from), var(--gradient-primary-to))',
                color: 'var(--on-primary)',
                boxShadow: '0 6px 20px var(--game-glow)'
              }}
              data-section="payment-buttons"
              data-testid="preview-commerce-btn-gradient"
              aria-label="Gradient checkout button"
            >
              Proceed to Checkout →
            </ClickableElement>

            {/* Secondary Buttons Row */}
            <div className="grid grid-cols-2 gap-4">
              <ClickableElement
                editKey="--btn-secondary-bg"
                className="py-3 rounded-lg font-semibold text-center"
                style={{ backgroundColor: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-fg)' }}
                data-section="payment-buttons"
                data-testid="preview-commerce-btn-add-cart"
                aria-label="Add to cart button"
              >
                Add to Cart
              </ClickableElement>
              <ClickableElement
                editKey="--btn-ghost-bg"
                className="py-3 rounded-lg font-semibold text-center border"
                style={{ backgroundColor: 'var(--btn-ghost-bg)', color: 'var(--btn-ghost-fg)', borderColor: 'var(--btn-ghost-border)' }}
                data-section="payment-buttons"
                data-testid="preview-commerce-btn-save-later"
                aria-label="Save for later button"
              >
                Save for Later
              </ClickableElement>
            </div>

            {/* Accent Button */}
            <ClickableElement
              editKey="--accent"
              className="w-full py-3 rounded-lg font-semibold text-center"
              style={{ backgroundColor: 'var(--action-accent)', color: 'var(--action-accent-fg)' }}
              data-section="payment-buttons"
              data-testid="preview-commerce-btn-gift"
              aria-label="Gift purchase button"
            >
              🎁 Purchase as Gift
            </ClickableElement>

            {/* Success Button */}
            <ClickableElement
              editKey="--btn-success-bg"
              className="w-full py-3 rounded-lg font-semibold text-center"
              style={{ backgroundColor: 'var(--btn-success-bg)', color: 'var(--btn-success-fg)' }}
              data-section="payment-buttons"
              data-testid="preview-commerce-btn-success"
              aria-label="Success action button"
            >
              ✓ Complete Enrollment
            </ClickableElement>
          </div>
        </div>

        {/* Footer */}
        <ClickableElement
          editKey="--muted"
          className="text-center text-sm p-6 rounded-xl"
          style={{ backgroundColor: 'var(--surface-muted)' }}
          data-testid="preview-commerce-footer"
          aria-label="Edit commerce footer"
        >
          <p style={{ color: 'var(--text-muted)' }} data-testid="preview-commerce-footer-text">
            Secure payments powered by {brandName}. Questions? Contact{' '}
            <span style={{ color: 'var(--link-fg)' }} data-testid="preview-commerce-footer-email">
              {state.supportEmail || 'billing@learnplay.com'}
            </span>
          </p>
          <div className="flex justify-center gap-6 mt-3" data-testid="preview-commerce-footer-links">
            <span style={{ color: 'var(--link-fg)' }}>Terms</span>
            <span style={{ color: 'var(--link-fg)' }}>Privacy</span>
            <span style={{ color: 'var(--link-fg)' }}>Refunds</span>
          </div>
        </ClickableElement>

      </div>
    </PreviewFrame>
  );
}

export default PreviewCommerce;
