export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'RailFlow Railway Reservation & Tracking API',
    version: '1.0.0',
    description:
      'Production-grade RESTful API for RailFlow: Indian Railways reservation, multi-provider live train tracking, segment-aware inventory management, and administrative control.',
    contact: {
      name: 'RailFlow Engineering Team',
    },
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Local Development Server',
    },
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'connect.sid',
        description: 'Session cookie issued upon successful registration or login.',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string', example: 'Descriptive error message' },
          code: { type: 'string', example: 'BAD_REQUEST' },
          details: { type: 'array', items: { type: 'object' } },
        },
        required: ['success', 'error', 'code'],
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'clxyz123' },
          email: { type: 'string', format: 'email', example: 'passenger@railflow.in' },
          name: { type: 'string', example: 'Demo Passenger' },
          phone: { type: 'string', nullable: true, example: '9876543210' },
          role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'USER' },
        },
      },
      Station: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          code: { type: 'string', example: 'NDLS' },
          name: { type: 'string', example: 'New Delhi' },
          fullName: { type: 'string', example: 'New Delhi Railway Station' },
          zone: { type: 'string', example: 'Northern Railway (NR)' },
          state: { type: 'string', example: 'Delhi' },
          isActive: { type: 'boolean', example: true },
        },
      },
      Train: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          number: { type: 'string', example: '22436' },
          name: { type: 'string', example: 'Vande Bharat Express' },
          type: {
            type: 'string',
            enum: ['VANDE_BHARAT', 'RAJDHANI', 'SHATABDI', 'DURONTO', 'SUPERFAST', 'MAIL_EXPRESS', 'PASSENGER'],
            example: 'VANDE_BHARAT',
          },
          isActive: { type: 'boolean', example: true },
        },
      },
      RouteStation: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          sequence: { type: 'integer', example: 1 },
          stationCode: { type: 'string', example: 'NDLS' },
          stationName: { type: 'string', example: 'New Delhi' },
          arrivalOffsetMin: { type: 'integer', nullable: true, example: null },
          departureOffsetMin: { type: 'integer', nullable: true, example: 0 },
          distanceKm: { type: 'integer', example: 0 },
          platform: { type: 'string', nullable: true, example: '16' },
        },
      },
      BookingPassenger: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'John Doe' },
          age: { type: 'integer', minimum: 1, maximum: 120, example: 32 },
          gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER'], example: 'MALE' },
          berthPreference: {
            type: 'string',
            enum: ['LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER', 'WINDOW', 'AISLE'],
            example: 'WINDOW',
          },
        },
        required: ['name', 'age', 'gender'],
      },
      Booking: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          pnr: { type: 'string', example: '8273619283' },
          trainRunId: { type: 'string' },
          classType: { type: 'string', example: 'EXEC_CHAIR' },
          status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'FAILED'], example: 'CONFIRMED' },
          paymentStatus: { type: 'string', enum: ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'], example: 'SUCCESS' },
          totalFarePaise: { type: 'integer', example: 175000 },
          quotaType: { type: 'string', example: 'GENERAL' },
          passengers: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'System Health Check',
        tags: ['System'],
        responses: {
          '200': {
            description: 'API is healthy and operational.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'RailFlow API is running' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/register': {
      post: {
        summary: 'Register New User',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email', example: 'passenger@railflow.in' },
                  password: { type: 'string', minLength: 8, example: 'Passenger@123' },
                  name: { type: 'string', minLength: 2, example: 'Demo Passenger' },
                  phone: { type: 'string', example: '9876543210' },
                },
                required: ['email', 'password', 'name'],
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'User registered and session created.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                      },
                    },
                  },
                },
              },
            },
          },
          '409': { description: 'Email already exists.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/auth/login': {
      post: {
        summary: 'Authenticate User',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email', example: 'passenger@railflow.in' },
                  password: { type: 'string', example: 'Passenger@123' },
                },
                required: ['email', 'password'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Invalid credentials.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        summary: 'Log Out User Session',
        tags: ['Authentication'],
        security: [{ cookieAuth: [] }],
        responses: {
          '200': { description: 'Logged out successfully.' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        summary: 'Get Current Authenticated User',
        tags: ['Authentication'],
        security: [{ cookieAuth: [] }],
        responses: {
          '200': {
            description: 'Current session user details.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthenticated.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/stations': {
      get: {
        summary: 'List or Search Stations',
        tags: ['Stations'],
        parameters: [
          { name: 'query', in: 'query', schema: { type: 'string' }, description: 'Search station by code or name' },
        ],
        responses: {
          '200': {
            description: 'List of matching stations.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        stations: { type: 'array', items: { $ref: '#/components/schemas/Station' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/trains/search': {
      get: {
        summary: 'Search Trains & Check Persisted Segment-Aware Availability',
        tags: ['Trains'],
        parameters: [
          { name: 'from', in: 'query', required: true, schema: { type: 'string' }, example: 'NDLS' },
          { name: 'to', in: 'query', required: true, schema: { type: 'string' }, example: 'BSB' },
          { name: 'date', in: 'query', required: true, schema: { type: 'string', format: 'date' }, example: '2026-10-25' },
          { name: 'passengers', in: 'query', schema: { type: 'integer', default: 1 }, example: 1 },
        ],
        responses: {
          '200': {
            description: 'Trains found matching route and date with real seat availability.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        trains: { type: 'array', items: { type: 'object' } },
                        fromStation: { $ref: '#/components/schemas/Station' },
                        toStation: { $ref: '#/components/schemas/Station' },
                        journeyDate: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid date or parameters.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '404': { description: 'Station not found.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/fares/quote': {
      get: {
        summary: 'Calculate Exact Server-Side Journey Fare',
        tags: ['Fares'],
        parameters: [
          { name: 'scheduleId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'from', in: 'query', required: true, schema: { type: 'string' }, example: 'NDLS' },
          { name: 'to', in: 'query', required: true, schema: { type: 'string' }, example: 'BSB' },
          { name: 'classType', in: 'query', required: true, schema: { type: 'string' }, example: 'EXEC_CHAIR' },
          { name: 'passengers', in: 'query', schema: { type: 'integer', default: 1 } },
        ],
        responses: {
          '200': {
            description: 'Paise-exact fare breakdown with GST and distance.',
          },
        },
      },
    },
    '/api/bookings': {
      post: {
        summary: 'Create Booking & Lock Persisted Seats for 10 Minutes',
        tags: ['Bookings'],
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  trainRunId: { type: 'string' },
                  scheduleId: { type: 'string' },
                  fromStationCode: { type: 'string', example: 'NDLS' },
                  toStationCode: { type: 'string', example: 'BSB' },
                  classType: { type: 'string', example: 'EXEC_CHAIR' },
                  quotaType: { type: 'string', default: 'GENERAL' },
                  passengers: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/BookingPassenger' },
                    minItems: 1,
                    maxItems: 6,
                  },
                },
                required: ['trainRunId', 'scheduleId', 'fromStationCode', 'toStationCode', 'classType', 'passengers'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Booking created with locked seat allocation.' },
          '409': { description: 'Insufficient seats remaining for requested class.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      get: {
        summary: 'List Authenticated User Bookings',
        tags: ['Bookings'],
        security: [{ cookieAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          '200': { description: 'User bookings paginated.' },
        },
      },
    },
    '/api/bookings/pnr/{pnr}': {
      get: {
        summary: 'Lookup Booking By PNR (Isolated To Owner or Admin)',
        tags: ['Bookings'],
        security: [{ cookieAuth: [] }],
        parameters: [{ name: 'pnr', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Booking details with passengers and seat allocations.' },
          '404': { description: 'PNR not found or belongs to another user.' },
        },
      },
    },
    '/api/bookings/{id}/cancel': {
      post: {
        summary: 'Cancel Confirmed Booking & Release Seats with Tiered Refund',
        tags: ['Bookings'],
        security: [{ cookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  reason: { type: 'string', example: 'Change of travel plans' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Booking cancelled and refund processed according to time tiers.' },
          '400': { description: 'Booking is already cancelled or train has departed.' },
        },
      },
    },
    '/api/payments/initialize': {
      post: {
        summary: 'Initialize Payment Transaction for Pending Booking',
        tags: ['Payments'],
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  bookingId: { type: 'string' },
                  method: { type: 'string', enum: ['UPI', 'NET_BANKING', 'DEBIT_CARD', 'CREDIT_CARD', 'WALLET'], default: 'UPI' },
                },
                required: ['bookingId'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Payment transaction initialized with idempotency key.' },
          '410': { description: 'Seat reservation lock expired.' },
        },
      },
    },
    '/api/payments/{id}/simulate-result': {
      post: {
        summary: 'Simulate Payment Outcome (SUCCESS or FAILED)',
        tags: ['Payments'],
        security: [{ cookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  outcome: { type: 'string', enum: ['SUCCESS', 'FAILED'] },
                  failureReason: { type: 'string' },
                },
                required: ['outcome'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Payment outcome simulated; booking confirmed or seats released.' },
        },
      },
    },
    '/api/tracking/{number}': {
      get: {
        summary: 'Get Live Running Status for Train Number',
        tags: ['Tracking'],
        parameters: [{ name: 'number', in: 'path', required: true, schema: { type: 'string' }, example: '22436' }],
        responses: {
          '200': { description: 'Real timetable or ChukChuk tracking telemetry.' },
          '404': { description: 'Train number not found in master timetable.' },
        },
      },
    },
    '/api/admin/summary': {
      get: {
        summary: 'Get Operational KPIs & System Metrics',
        tags: ['Admin'],
        security: [{ cookieAuth: [] }],
        responses: {
          '200': { description: 'Operational overview (trains, stations, revenue, bookings).' },
          '403': { description: 'Forbidden. Admin privileges required.' },
        },
      },
    },
    '/api/admin/trains': {
      get: {
        summary: 'List All Master Trains',
        tags: ['Admin'],
        security: [{ cookieAuth: [] }],
        responses: { '200': { description: 'List of all trains.' } },
      },
      post: {
        summary: 'Create New Master Train',
        tags: ['Admin'],
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  number: { type: 'string', example: '12004' },
                  name: { type: 'string', example: 'Lucknow Shatabdi' },
                  type: { type: 'string', example: 'SHATABDI' },
                  isActive: { type: 'boolean', default: true },
                },
                required: ['number', 'name', 'type'],
              },
            },
          },
        },
        responses: { '201': { description: 'Train created.' } },
      },
    },
    '/api/admin/trains/{id}': {
      put: {
        summary: 'Update Master Train',
        tags: ['Admin'],
        security: [{ cookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Train updated.' } },
      },
      delete: {
        summary: 'Deactivate Master Train',
        tags: ['Admin'],
        security: [{ cookieAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Train deactivated.' } },
      },
    },
    '/api/admin/stations': {
      get: {
        summary: 'List All Master Stations',
        tags: ['Admin'],
        security: [{ cookieAuth: [] }],
        responses: { '200': { description: 'List of stations.' } },
      },
      post: {
        summary: 'Create Master Station',
        tags: ['Admin'],
        security: [{ cookieAuth: [] }],
        responses: { '201': { description: 'Station created.' } },
      },
    },
    '/api/admin/routes': {
      get: {
        summary: 'List All Master Routes with Stops',
        tags: ['Admin'],
        security: [{ cookieAuth: [] }],
        responses: { '200': { description: 'List of routes.' } },
      },
      post: {
        summary: 'Create Master Route',
        tags: ['Admin'],
        security: [{ cookieAuth: [] }],
        responses: { '201': { description: 'Route created.' } },
      },
    },
  },
};
