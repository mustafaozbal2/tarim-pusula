import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './auth/access';
import {
  AUTH_CONFIG,
  AuthService,
  DB,
  SMS,
  defaultAuthConfig,
  type AuthConfig,
} from './auth/auth.service';
import type { SmsProvider } from './auth/sms';
import {
  AdminController,
  AuthController,
  DevicesController,
  FieldsController,
  MeController,
} from './controllers';
import { CropsController, NearbyController, PLACES, PlacesController } from './controllers.g2';
import { AnnouncementsController, FieldCalendarController } from './controllers.g4';
import { PanelController, PanelMfaController } from './controllers.g5';
import { LibraryController } from './controllers.g6';
import { IrrigationController } from './controllers.g8';
import {
  MARKET_FETCH,
  MARKET_SLEEP,
  MARKET_SOURCES,
  MarketCollector,
  defaultMarketSources,
  type MarketSourceConfig,
} from './market/collector';
import { MarketController, MarketJobsController } from './market/controller';
import { MarketService } from './market/service';
import { InMemoryBroker } from '@tarim/device-sim';
import { DEVICE_BROKER, IrrigationService } from './irrigation';
import { Places } from './places';
import { DataService } from './data.service';
import type { Db } from './db/db';
import { PusulaController } from './pusula/pusula.controller';
import { LLM, PusulaService } from './pusula/pusula.service';
import { PusulaTools } from './pusula/tools';
import { AnthropicProvider, FakeLlmProvider, type LlmProvider } from './pusula/provider';
import { HealthController } from './health.controller';
import {
  FakePushClient,
  InMemoryQueue,
  type NotificationQueue,
  type PushClient,
} from '@tarim/workers';
import { NotifyService } from './weather/notify';
import { FakeWeatherProvider, type WeatherProvider } from './weather/openmeteo';
import { CLOCK, NOTIFY_QUEUE, PUSH, WEATHER } from './weather/tokens';
import { JobsController, PushTokenController, TodayController } from './weather/weather.controller';

export interface AppOptions {
  db: Db;
  sms: SmsProvider;
  auth?: Partial<AuthConfig>;
  places?: Places;
  /** Verilmezse ağa çıkmayan sahte sağlayıcı (testler ve anahtarsız geliştirme). */
  weather?: WeatherProvider;
  queue?: NotificationQueue;
  push?: PushClient;
  /** Verilmezse ANTHROPIC_API_KEY varsa Claude, yoksa ağa çıkmayan sahte sağlayıcı. */
  llm?: LlmProvider;
  /** Cihaz aracısı. Verilmezse süreç içi aracı (gerçek MQTT/TLS aracısı üretimde bunun yerine geçer). */
  broker?: InMemoryBroker;
  /** Pazar toplayıcıları: ağ, kaynak listesi ve bekleme. Verilmezse gerçek fetch ve ortam değişkenleri. */
  market?: {
    fetch?: typeof fetch;
    sources?: MarketSourceConfig[];
    sleep?: (ms: number) => Promise<void>;
  };
  now?: () => Date;
}

function defaultLlm(): LlmProvider {
  const key = process.env['ANTHROPIC_API_KEY'];
  return key
    ? new AnthropicProvider(key, process.env['PUSULA_MODEL'] || undefined)
    : new FakeLlmProvider();
}

@Module({})
export class AppModule {
  static register(opts: AppOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
        FieldsController,
        DevicesController,
        MeController,
        AdminController,
        PlacesController,
        CropsController,
        NearbyController,
        TodayController,
        PushTokenController,
        JobsController,
        FieldCalendarController,
        AnnouncementsController,
        PanelMfaController,
        PanelController,
        LibraryController,
        PusulaController,
        IrrigationController,
        MarketController,
        MarketJobsController,
      ],
      providers: [
        { provide: DB, useValue: opts.db },
        { provide: SMS, useValue: opts.sms },
        { provide: AUTH_CONFIG, useValue: { ...defaultAuthConfig(), ...opts.auth } },
        { provide: PLACES, useFactory: () => opts.places ?? Places.load() },
        { provide: WEATHER, useValue: opts.weather ?? new FakeWeatherProvider() },
        { provide: NOTIFY_QUEUE, useValue: opts.queue ?? new InMemoryQueue() },
        { provide: PUSH, useValue: opts.push ?? new FakePushClient() },
        { provide: CLOCK, useValue: opts.now ?? (() => new Date()) },
        { provide: LLM, useFactory: () => opts.llm ?? defaultLlm() },
        TodayController,
        FieldCalendarController,
        { provide: DEVICE_BROKER, useFactory: () => opts.broker ?? new InMemoryBroker() },
        IrrigationService,
        { provide: MARKET_FETCH, useValue: opts.market?.fetch ?? fetch },
        {
          provide: MARKET_SOURCES,
          useFactory: () => opts.market?.sources ?? defaultMarketSources(),
        },
        {
          provide: MARKET_SLEEP,
          useValue:
            opts.market?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))),
        },
        MarketCollector,
        MarketService,
        PusulaTools,
        PusulaService,
        NotifyService,
        AuthService,
        DataService,
        { provide: APP_GUARD, useClass: AccessGuard },
      ],
    };
  }
}
