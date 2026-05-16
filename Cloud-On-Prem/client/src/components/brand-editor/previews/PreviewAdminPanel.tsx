import { PreviewFrame, ClickableElement } from '../PreviewFrame';
import { useBrandEditor } from '../BrandEditorShell';

export function PreviewAdminPanel() {
  const { state } = useBrandEditor();
  const brandName = state.brandName || 'LearnPlay';

  return (
    <PreviewFrame className="min-h-[900px]" data-testid="preview-admin">
      <div className="flex h-full" style={{ backgroundColor: 'var(--surface-primary)' }}>
        <ClickableElement 
          editKey="--admin-sidebar-bg"
          interactive={false}
          className="w-64 shrink-0 flex flex-col"
          style={{ 
            backgroundColor: 'var(--admin-sidebar-bg, var(--surface-raised))', 
            borderRight: '1px solid var(--sidebar-border, var(--stroke-default))' 
          }}
          data-testid="preview-admin-sidebar"
          aria-label="Edit sidebar background color"
        >
          <div 
            className="p-4 border-b flex items-center gap-3"
            style={{ borderColor: 'var(--sidebar-border, var(--stroke-default))' }}
            data-testid="preview-admin-sidebar-header"
          >
            {state.logoUrl ? (
              <img src={state.logoUrl} alt="Logo" className="h-8 w-8 object-contain rounded-lg" data-testid="preview-admin-sidebar-logo" />
            ) : (
              <div 
                className="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold"
                style={{ 
                  background: 'linear-gradient(135deg, var(--action-primary), var(--action-secondary))',
                  color: 'var(--action-primary-fg)'
                }} 
                data-testid="preview-admin-sidebar-logo-placeholder"
              >
                {brandName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <ClickableElement
                editKey="--admin-sidebar-fg"
                as="span"
                className="font-bold text-sm tracking-wide"
                style={{ color: 'var(--admin-sidebar-fg, var(--text-primary))' }}
                data-testid="preview-admin-sidebar-brand-name"
                aria-label="Edit sidebar text color"
              >
                {brandName.toUpperCase()}
              </ClickableElement>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Admin Panel</p>
            </div>
          </div>
          
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {[
              { label: 'Dashboard', description: 'Overview & Stats', active: true },
              { label: 'Collections', description: 'Manage Collections', active: false },
              { label: 'Cards', description: 'Manage Cards', active: false },
              { label: 'Users', description: 'User Management', active: false },
              { label: 'Settings', description: 'System Config', active: false },
            ].map((item) => (
              <ClickableElement
                key={item.label}
                editKey={item.active ? '--admin-sidebar-active-bg' : '--admin-sidebar-item-hover-bg'}
                className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all relative"
                style={{ 
                  backgroundColor: item.active 
                    ? 'var(--admin-sidebar-active-bg, var(--action-primary))' 
                    : 'transparent',
                  color: item.active 
                    ? 'var(--admin-sidebar-active-fg, var(--action-primary-fg))' 
                    : 'var(--admin-sidebar-fg, var(--text-primary))',
                }}
                data-testid={`preview-admin-nav-item-${item.label.toLowerCase()}`}
                aria-label={`Edit ${item.active ? 'active' : 'hover'} nav item style`}
              >
                {item.active && (
                  <div 
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                    style={{ background: 'linear-gradient(to bottom, var(--action-primary), var(--action-secondary))' }}
                  />
                )}
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ 
                    backgroundColor: item.active 
                      ? 'color-mix(in srgb, var(--admin-sidebar-active-fg, var(--action-primary-fg)) 20%, transparent)' 
                      : 'var(--surface-muted)',
                  }}
                >
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: 'currentColor', opacity: 0.7 }} />
                </div>
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs opacity-70">{item.description}</p>
                </div>
              </ClickableElement>
            ))}
          </nav>

          <div className="p-3 space-y-2 border-t" style={{ borderColor: 'var(--sidebar-border, var(--stroke-default))' }}>
            <ClickableElement
              editKey="--btn-ghost-bg"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
              style={{ 
                backgroundColor: 'var(--surface-muted)',
                color: 'var(--text-primary)'
              }}
              data-testid="preview-admin-back-button"
              aria-label="Edit ghost button style"
            >
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'currentColor', opacity: 0.5 }} />
              Back to Home
            </ClickableElement>
            <ClickableElement
              editKey="--btn-danger-bg"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
              style={{ 
                backgroundColor: 'var(--destructive)',
                color: 'var(--destructive-foreground)'
              }}
              data-testid="preview-admin-logout-button"
              aria-label="Edit destructive button style"
            >
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'currentColor', opacity: 0.5 }} />
              Logout
            </ClickableElement>
          </div>
        </ClickableElement>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ClickableElement
            editKey="--nav-bg"
            interactive={false}
            className="shrink-0 px-6 py-4 flex items-center justify-between"
            style={{ 
              backgroundColor: 'var(--nav-bg, var(--surface-raised))',
              borderBottom: '1px solid var(--nav-border, var(--stroke-default))'
            }}
            data-testid="preview-admin-header"
            aria-label="Edit navigation header style"
          >
            <div>
              <ClickableElement 
                editKey="--foreground" 
                as="h1" 
                className="text-xl font-bold" 
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
                data-testid="preview-admin-page-title"
                aria-label="Edit page title color"
              >
                Admin Dashboard
              </ClickableElement>
              <p className="text-sm" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                Manage collections and cards
              </p>
            </div>
            <div 
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ 
                background: 'linear-gradient(135deg, var(--action-primary)/20, var(--action-secondary)/20)',
                border: '1px solid var(--action-primary)',
                color: 'var(--action-primary)'
              }}
            >
              ADMIN
            </div>
          </ClickableElement>

          <div className="flex-1 p-6 space-y-6 overflow-auto" data-testid="preview-admin-main-content">
            <div className="grid grid-cols-4 gap-4" data-testid="preview-admin-stats-grid">
              {[
                { label: 'Total Users', value: '1,234', change: '+12%', status: 'success' },
                { label: 'Active Courses', value: '48', change: '+3', status: 'success' },
                { label: 'Revenue', value: '$24.5k', change: '-2%', status: 'danger' },
                { label: 'Pending', value: '15', change: 'Review', status: 'warning' },
              ].map((stat, i) => (
                <ClickableElement
                  key={i}
                  editKey="--card-bg"
                  interactive={false}
                  className="p-4 rounded-xl relative overflow-hidden"
                  style={{ 
                    backgroundColor: 'var(--card-bg, var(--surface-raised))', 
                    border: '1px solid var(--card-border, var(--stroke-default))' 
                  }}
                  data-testid={`preview-admin-stat-card-${i}`}
                  aria-label="Edit stat card style"
                >
                  <p 
                    className="text-sm font-medium mb-1" 
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {stat.label}
                  </p>
                  <p 
                    className="text-2xl font-bold" 
                    style={{ color: 'var(--card-fg, var(--text-primary))' }}
                  >
                    {stat.value}
                  </p>
                  <ClickableElement 
                    editKey={stat.status === 'success' ? '--success' : stat.status === 'warning' ? '--warning' : '--destructive'}
                    as="span"
                    className="text-xs font-medium mt-1 inline-block px-2 py-0.5 rounded-full"
                    style={{ 
                      backgroundColor: stat.status === 'success' 
                        ? 'var(--success)' 
                        : stat.status === 'warning' 
                          ? 'var(--warning)' 
                          : 'var(--destructive)',
                      color: stat.status === 'success' 
                        ? 'var(--success-foreground)' 
                        : stat.status === 'warning' 
                          ? 'var(--warning-foreground)' 
                          : 'var(--destructive-foreground)',
                    }}
                    data-testid={`preview-admin-stat-change-${i}`}
                    aria-label={`Edit ${stat.status} status color`}
                  >
                    {stat.change}
                  </ClickableElement>
                </ClickableElement>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-6">
              <ClickableElement
                editKey="--card-bg"
                interactive={false}
                className="rounded-xl overflow-hidden"
                style={{ 
                  backgroundColor: 'var(--card-bg, var(--surface-raised))', 
                  border: '1px solid var(--card-border, var(--stroke-default))' 
                }}
                data-testid="preview-admin-buttons-section"
                aria-label="Edit card style"
              >
                <div 
                  className="font-semibold text-sm border-b"
                  style={{ 
                    backgroundColor: 'var(--panel-header-bg, var(--surface-muted))',
                    borderColor: 'var(--stroke-default)',
                    color: 'var(--panel-header-fg, var(--text-primary))',
                    fontFamily: 'var(--font-heading)',
                    padding: 'var(--space-sm) var(--space-md)'
                  }}
                >
                  Button Variants
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <ClickableElement
                      editKey="--btn-primary-bg"
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ 
                        backgroundColor: 'var(--btn-primary-bg, var(--action-primary))',
                        color: 'var(--btn-primary-fg, var(--action-primary-fg))'
                      }}
                      data-testid="preview-admin-btn-primary"
                      aria-label="Edit primary button style"
                    >
                      Primary
                    </ClickableElement>
                    <ClickableElement
                      editKey="--btn-secondary-bg"
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ 
                        backgroundColor: 'var(--btn-secondary-bg, var(--action-secondary))',
                        color: 'var(--btn-secondary-fg, var(--action-secondary-fg))'
                      }}
                      data-testid="preview-admin-btn-secondary"
                      aria-label="Edit secondary button style"
                    >
                      Secondary
                    </ClickableElement>
                    <ClickableElement
                      editKey="--btn-danger-bg"
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ 
                        backgroundColor: 'var(--btn-danger-bg, var(--destructive))',
                        color: 'var(--btn-danger-fg, var(--destructive-foreground))'
                      }}
                      data-testid="preview-admin-btn-destructive"
                      aria-label="Edit destructive button style"
                    >
                      Destructive
                    </ClickableElement>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ClickableElement
                      editKey="--btn-outline-bg"
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ 
                        backgroundColor: 'var(--btn-outline-bg, transparent)',
                        color: 'var(--btn-outline-fg, var(--action-primary))',
                        border: '1px solid var(--btn-outline-border, var(--action-primary))'
                      }}
                      data-testid="preview-admin-btn-outline"
                      aria-label="Edit outline button style"
                    >
                      Outline
                    </ClickableElement>
                    <ClickableElement
                      editKey="--btn-ghost-bg"
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ 
                        backgroundColor: 'var(--btn-ghost-bg, transparent)',
                        color: 'var(--btn-ghost-fg, var(--text-primary))',
                        border: '1px solid var(--btn-ghost-border, var(--stroke-default))'
                      }}
                      data-testid="preview-admin-btn-ghost"
                      aria-label="Edit ghost button style"
                    >
                      Ghost
                    </ClickableElement>
                    <ClickableElement
                      editKey="--btn-success-bg"
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ 
                        backgroundColor: 'var(--btn-success-bg, var(--success))',
                        color: 'var(--btn-success-fg, var(--success-foreground))'
                      }}
                      data-testid="preview-admin-btn-success"
                      aria-label="Edit success button style"
                    >
                      Success
                    </ClickableElement>
                  </div>
                </div>
              </ClickableElement>

              <ClickableElement
                editKey="--card-bg"
                className="rounded-xl overflow-hidden"
                style={{ 
                  backgroundColor: 'var(--card-bg, var(--surface-raised))', 
                  border: '1px solid var(--card-border, var(--stroke-default))' 
                }}
                data-testid="preview-admin-badges-section"
                aria-label="Edit card style"
              >
                <div 
                  className="font-semibold text-sm border-b"
                  style={{ 
                    backgroundColor: 'var(--panel-header-bg, var(--surface-muted))',
                    borderColor: 'var(--stroke-default)',
                    color: 'var(--panel-header-fg, var(--text-primary))',
                    fontFamily: 'var(--font-heading)',
                    padding: 'var(--space-sm) var(--space-md)'
                  }}
                >
                  Badge Variants
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <ClickableElement
                      editKey="--badge-bg"
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ 
                        backgroundColor: 'var(--badge-bg, var(--action-primary))',
                        color: 'var(--badge-fg, var(--action-primary-fg))'
                      }}
                      data-testid="preview-admin-badge-default"
                      aria-label="Edit default badge style"
                    >
                      Default
                    </ClickableElement>
                    <ClickableElement
                      editKey="--badge-secondary-bg"
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ 
                        backgroundColor: 'var(--badge-secondary-bg, var(--action-secondary))',
                        color: 'var(--badge-secondary-fg, var(--action-secondary-fg))'
                      }}
                      data-testid="preview-admin-badge-secondary"
                      aria-label="Edit secondary badge style"
                    >
                      Secondary
                    </ClickableElement>
                    <ClickableElement
                      editKey="--badge-outline-border"
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ 
                        backgroundColor: 'var(--badge-outline-bg, transparent)',
                        color: 'var(--badge-outline-fg, var(--action-primary))',
                        border: '1px solid var(--badge-outline-border, var(--action-primary))'
                      }}
                      data-testid="preview-admin-badge-outline"
                      aria-label="Edit outline badge style"
                    >
                      Outline
                    </ClickableElement>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ClickableElement
                      editKey="--success"
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ 
                        backgroundColor: 'var(--success)',
                        color: 'var(--success-foreground)'
                      }}
                      data-testid="preview-admin-badge-active"
                      aria-label="Edit success/active badge style"
                    >
                      Active
                    </ClickableElement>
                    <ClickableElement
                      editKey="--warning"
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ 
                        backgroundColor: 'var(--warning)',
                        color: 'var(--warning-foreground)'
                      }}
                      data-testid="preview-admin-badge-pending"
                      aria-label="Edit warning/pending badge style"
                    >
                      Pending
                    </ClickableElement>
                    <ClickableElement
                      editKey="--destructive"
                      className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ 
                        backgroundColor: 'var(--destructive)',
                        color: 'var(--destructive-foreground)'
                      }}
                      data-testid="preview-admin-badge-inactive"
                      aria-label="Edit destructive/inactive badge style"
                    >
                      Inactive
                    </ClickableElement>
                  </div>
                </div>
              </ClickableElement>
            </div>

            <ClickableElement 
              editKey="--card-bg"
              className="rounded-xl overflow-hidden"
              style={{ 
                backgroundColor: 'var(--card-bg, var(--surface-raised))', 
                border: '1px solid var(--card-border, var(--stroke-default))' 
              }}
              data-testid="preview-admin-table-section"
              aria-label="Edit table card style"
            >
              <div 
                className="px-4 py-3 font-semibold text-sm border-b flex items-center justify-between"
                style={{ 
                  backgroundColor: 'var(--panel-header-bg, var(--surface-muted))',
                  borderColor: 'var(--stroke-default)',
                  color: 'var(--panel-header-fg, var(--text-primary))'
                }}
              >
                <span>User Management</span>
                <ClickableElement
                  editKey="--btn-primary-bg"
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ 
                    backgroundColor: 'var(--btn-primary-bg, var(--action-primary))',
                    color: 'var(--btn-primary-fg, var(--action-primary-fg))'
                  }}
                  data-testid="preview-admin-table-add-btn"
                  aria-label="Edit primary button"
                >
                  + Add User
                </ClickableElement>
              </div>
              
              <div className="overflow-hidden">
                <ClickableElement
                  editKey="--table-header-bg"
                  className="grid grid-cols-5 gap-4 px-4 py-2 text-xs font-medium uppercase tracking-wide"
                  style={{ 
                    backgroundColor: 'var(--table-header-bg, var(--surface-muted))',
                    color: 'var(--table-header-fg, var(--text-primary))',
                    borderBottom: '1px solid var(--table-cell-border, var(--stroke-default))'
                  }}
                  data-testid="preview-admin-table-header"
                  aria-label="Edit table header style"
                >
                  <span>Name</span>
                  <span>Email</span>
                  <span>Role</span>
                  <span>Status</span>
                  <span>Actions</span>
                </ClickableElement>
                
                {[
                  { name: 'John Doe', email: 'john@example.com', role: 'Admin', status: 'Active' },
                  { name: 'Jane Smith', email: 'jane@example.com', role: 'Teacher', status: 'Pending' },
                  { name: 'Bob Wilson', email: 'bob@example.com', role: 'Student', status: 'Inactive' },
                ].map((user, i) => (
                  <ClickableElement
                    key={i}
                    editKey={i % 2 === 0 ? '--table-row-bg' : '--table-row-alt-bg'}
                    className="grid grid-cols-5 gap-4 px-4 py-3 text-sm items-center"
                    style={{ 
                      backgroundColor: i % 2 === 0 
                        ? 'var(--table-row-bg, var(--surface-raised))' 
                        : 'var(--table-row-alt-bg, var(--surface-muted))',
                      color: 'var(--table-row-fg, var(--text-primary))',
                      borderBottom: '1px solid var(--table-cell-border, var(--stroke-default))'
                    }}
                    data-testid={`preview-admin-table-row-${i}`}
                    aria-label={`Edit table row ${i % 2 === 0 ? 'default' : 'alternating'} style`}
                  >
                    <span className="font-medium">{user.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{user.email}</span>
                    <span 
                      className="px-2 py-0.5 rounded text-xs w-fit"
                      style={{ 
                        backgroundColor: 'var(--surface-muted)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      {user.role}
                    </span>
                    <span 
                      className="px-2 py-0.5 rounded-full text-xs w-fit"
                      style={{ 
                        backgroundColor: user.status === 'Active' 
                          ? 'var(--success)' 
                          : user.status === 'Pending' 
                            ? 'var(--warning)' 
                            : 'var(--destructive)',
                        color: user.status === 'Active' 
                          ? 'var(--success-foreground)' 
                          : user.status === 'Pending' 
                            ? 'var(--warning-foreground)' 
                            : 'var(--destructive-foreground)',
                      }}
                    >
                      {user.status}
                    </span>
                    <div className="flex gap-1">
                      <button 
                        className="px-2 py-1 rounded text-xs"
                        style={{ 
                          backgroundColor: 'var(--btn-ghost-bg, var(--surface-muted))',
                          color: 'var(--btn-ghost-fg, var(--text-primary))'
                        }}
                      >
                        Edit
                      </button>
                      <button 
                        className="px-2 py-1 rounded text-xs"
                        style={{ 
                          backgroundColor: 'var(--btn-danger-bg, var(--destructive))',
                          color: 'var(--btn-danger-fg, var(--destructive-foreground))'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </ClickableElement>
                ))}
              </div>
            </ClickableElement>

            <ClickableElement 
              editKey="--card-bg"
              className="rounded-xl overflow-hidden"
              style={{ 
                backgroundColor: 'var(--card-bg, var(--surface-raised))', 
                border: '1px solid var(--card-border, var(--stroke-default))' 
              }}
              data-testid="preview-admin-activity-card"
              aria-label="Edit activity card style"
            >
              <div 
                className="px-4 py-3 border-b font-semibold text-sm" 
                style={{ 
                  borderColor: 'var(--stroke-default)',
                  backgroundColor: 'var(--panel-header-bg, var(--surface-muted))',
                  color: 'var(--panel-header-fg, var(--text-primary))'
                }} 
                data-testid="preview-admin-activity-header"
              >
                Recent Activity
              </div>
              <div>
                {[
                  { user: 'John Doe', action: 'completed', item: 'Python Basics', time: '2h ago' },
                  { user: 'Jane Smith', action: 'enrolled in', item: 'Web Development', time: '4h ago' },
                  { user: 'Mike Wilson', action: 'earned certificate for', item: 'Data Science', time: '1d ago' },
                ].map((activity, i) => (
                  <div 
                    key={i} 
                    className="p-4 flex items-center gap-3"
                    style={{ 
                      borderBottom: i < 2 ? '1px solid var(--stroke-default)' : 'none',
                      backgroundColor: i % 2 === 0 
                        ? 'var(--activity-item-bg, transparent)' 
                        : 'var(--surface-muted)'
                    }}
                    data-testid={`preview-admin-activity-row-${i}`}
                  >
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0"
                      style={{ 
                        backgroundColor: 'var(--surface-muted)', 
                        color: 'var(--text-muted)' 
                      }}
                    >
                      {activity.user[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        <span className="font-medium">{activity.user}</span>
                        {' '}{activity.action}{' '}
                        <span style={{ color: 'var(--action-primary)' }}>{activity.item}</span>
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{activity.time}</p>
                    </div>
                    <ClickableElement 
                      editKey="--accent"
                      className="px-2 py-1 rounded text-xs shrink-0"
                      style={{ 
                        backgroundColor: 'var(--action-accent)', 
                        color: 'var(--action-accent-fg)' 
                      }}
                      data-testid={`preview-admin-activity-view-btn-${i}`}
                      aria-label="Edit accent button style"
                    >
                      View
                    </ClickableElement>
                  </div>
                ))}
              </div>
            </ClickableElement>
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

export default PreviewAdminPanel;
